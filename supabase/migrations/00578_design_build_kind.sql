-- ═══════════════════════════════════════════════════════════════════════════
-- 00578 — Turnkey: the design-build class (Agreement, Composed · Wave 3)
--
-- Rulings implemented: R10 (the attestation gates the template), R11 (the six
--   jurisdiction notices ship seeded and DISABLED), R13 (identities yes, the
--   bid ledger never), R15 (the deposit is OFFERED after signature, never a
--   gate), R9 (pricing_basis / draws / allowances are record-only; the only
--   authority this class writes is billing_cadence = 'per_draw').
--
-- Lineage of every function redefined here — RE-ANCHORED at branch time with
--   grep -rln "CREATE OR REPLACE FUNCTION[^(]*<name>" supabase/migrations/*.sql | sort | tail -1
-- and each body copied VERBATIM from that winner before the delta was grafted:
--   _agreement_fee_unnamed ..................... 00575:452  → 00578
--   upsert_design_services_draft ............... 00412 → 00422 → 00575:2325 → 00578
--   _sign_design_services_agreement_authorized . 00412:767 → 00575:915 → 00577:1668 → 00578   [PINNED]
--   guard_commercial_signature_insert .......... 00412 → 00566:89 → 00578                     [PINNED]
--   app_private.issue_invoice_for_actor ........ 00412 → 00511:3713 → 00578                   [PINNED]
--   _is_design_services_project ................ 00412:2326 → 00578
--   classify_project_time_entry_authority ...... 00412 → 00575:2002 → 00578
--   guard_project_ffe_purchase_authority ....... 00412 → 00423:655 → 00578
--   _create_furnishings_authorization_from_schedule_impl
--                                                00423:897 (as
--                                                create_furnishings_authorization_from_schedule,
--                                                RENAMED by 00462:1401) → 00578
--   create_trade_scope ......................... 00423:1284 → 00578
--   publish_budget_checkpoint .................. 00423:3266 → 00578
--   get_client_project_threshold ............... 00565:447 → 00578
--   _execute_furnishings_authorization_authorized .......... 00511:5372 → 00578 [PINNED]
--   _execute_trade_scope_authorized ........................ 00511:5787 → 00578 [PINNED]
--   _execute_furnishings_authorization_on_paper_authorized . 00511:4639 → 00578 [PINNED]
--   _execute_trade_scope_on_paper_authorized ............... 00511:5039 → 00578 [PINNED]
--   upsert_agreement_parts ..................... 00575 → 00577:1034 → 00578
--   materialize_agreement_template ............. 00576:718 → 00578
--   _countersign_design_services_agreement_impl  00475 → 00511 → 00566 → 00577:1942 → 00578 [PINNED]
--   send_commercial_document ................... 00412 → 00423 → 00575:599 → 00578
--   get_client_commercial_document_bundle ...... 00425 → 00575 → 00577:2559 → 00578
--   compose_agreement_consent .................. 00577:752 → 00578
--   _render_agreement_snapshot_html ............ 00577:476 → 00578   (B1/B2)
--
-- NOT redefined, deliberately:
--   sign_design_services_agreement_with_trusted_ip — a thin wrapper (00577
--     PART 10); the impl it calls IS grafted, and so is the trigger guard that
--     refuses the row (D-W3-2 / D-W3-3).
--   _commercial_document_fingerprint — every authored design-build payload
--     lives in proposal_agreement_parts, which 00575 already folds in. The
--     draw ledger below is post-send MACHINE state (invoice id, issued_at) and
--     belongs outside the hash. SQL-T11 and reviewer criterion RC-8 exist to
--     falsify that claim; if either fails, a third CASE arm is owed.
--   _issue_design_services_agreement_on_paper (00575:1059) and
--     _record_paper_client_signature_impl (00575:1176) — PAPER execution of a
--     turnkey prime is out of scope this wave. Both stay closed to
--     'design_build' ON PURPOSE, and the walk never exercises them. Note that
--     PART 7b widening (b) does technically admit a paper client signature on
--     a design-build prime AT THE GUARD; the door stays shut one level down,
--     at the RPC, and that is where it is meant to be shut.
--   discard_agreement_parts (00575:3362) and materialize_standard_parts
--     (00575:3102) — both promote or dissolve the NINE-PART design-services
--     composition. A design-build prime is composed only from its template and
--     cannot be dissolved back into a seven-facet room that has no editor for
--     it, so both stay closed to the kind.
--   save_agreement_as_template (00576:621) — saving a turnkey agreement into a
--     studio Library is Wave 4; its class map stays as W2 wrote it.
--   create_service_addendum (00422:1863, :1888) — an addendum to a
--     design-build prime is out of scope this wave. Left closed, said here so
--     the next reader sees a choice and not an oversight.
--   set_invoice_studio_id (00571:405, :631) — its per-kind list scopes the
--     CLIENT-ACTOR leg of a PROJECT-BOUND invoice. Every draw invoice below is
--     inserted by the studio or by service_role, so that leg is never the one
--     that judges it; the deposit draw, minted before countersign, has no
--     project at all and takes 00571's studio-anchored branch instead.
--   public.issue_invoice(uuid, date) — no anchor logic (00412:2694, delegating
--     to _issue_invoice_pre_00412), deliberately the one the draw rail calls.
--
-- Findings against the build sheet, recorded rather than silently fixed:
--   F-W3-1  _agreement_fee_unnamed (00575:452) refuses EVERY design-build
--           signature: the predicate counts only rate_card / flat / per_phase,
--           and a turnkey prime carries none of them. It is asked at all three
--           doors, so widening the kind lists alone would have produced a
--           client signature that raises "This agreement names no fee." PART
--           7a teaches it that a pricing basis carrying a contract sum names a
--           fee. The sheet's PART 7b list did not have this.
--   F-W3-2  compose_agreement_consent (00577:752) returns the GENERIC fallback
--           for any kind outside design_services / service_addendum — which is
--           exactly the sentence the walk's step 12 names as the tell of a
--           missed branch. PART 12b composes the turnkey sentence.
--   F-W3-3  create_draft_invoice is listed in the sheet's PART 7c at
--           00511:3846; the enumerator attributes that line to
--           app_private.issue_invoice_for_actor, whose body it is. There is no
--           separate origin leg in create_draft_invoice, so it is NOT grafted.
--           get_client_project_selections carries the motif at 00423:2963 but
--           its head is 00441:82, which does not — nothing to graft.
--   F-W3-7  THE ATTESTATION IS NOT A PART OF THE PAPER. The build sheet's PART
--           13 says patina.licensing_attestation is "materialized from
--           studio_license_attestations at compose time" AND, in the same
--           sentence, that it is "a studio-level record rather than a rail
--           row" whose "Client sees" cell is no — and its walk step 4 asserts
--           TEN parts in the rail. Both cannot hold: a row in
--           proposal_agreement_parts IS the rail. This file materializes no
--           attestation part. What gates the class is the studio-level record
--           itself, asked at the two load-bearing doors
--           (materialize_agreement_template, send_commercial_document) through
--           studio_has_live_license_attestation. The vocabulary keeps the
--           'attestation' kind (contract §1) and both snapshot passes already
--           skip it, so a later wave that decides the paper should carry the
--           credential can add the row without moving anything here.
--           PUBLISHED to the designer and client lanes in backend-notes §5.
--
-- Round-1 adversarial review, fixed in place (blockers B1-B4, majors M2-M3):
--   B1/B2  _render_agreement_snapshot_html did not know the turnkey class:
--          pricing basis, draws and allowances all fell through its record-only
--          fallback, so R12's keepsake carried no sum, no draw and no
--          retainage — and it closed with "This agreement authorizes design
--          services only", a false sentence frozen into the homeowner's
--          durable record of a construction contract. PART 12c grafts it from
--          00577:476 with three arms and a boundary that knows its class.
--   B3     get_client_commercial_document_bundle projected the pricing basis
--          payload RAW — the trades at cost, feeBps, subMarkupBps and the cost
--          basis — to a homeowner whose closed-book clause says she is not
--          shown them, and R22 forbids hiding the part instead (a turnkey
--          prime that names no fee cannot be signed). The payload is now
--          redacted at that one edge and the derived schedule of values goes
--          in its place (_agreement_redact_client_payload in PART 6, read by
--          PART 12 and by the keepsake, RC-4).
--   B4     the seeded flow-down clause did not exist anywhere. It is now the
--          eleventh entry of patina.design_build, `enabled: false`, and
--          materialize_agreement_template refuses to compose a disabled entry
--          (PART 8b, PART 13, R16).
--   M3     agreement_draw_lien_waivers was written by a direct INSERT grant.
--          The grant and its policy are withdrawn and PART 5b is the door,
--          which is what "no wave writes business tables outside definer
--          RPCs" means. ⚠ The designer lane's use-design-build.ts writes that
--          table directly and must move to the RPC — published in
--          backend-notes §7.
--   (M2 is 00579's: a token spent by its own signature now resolves to the
--    settled receipt, while an administratively revoked one still resolves to
--    nothing.)
--
-- Wave 3 close-out rulings, applied in place (this migration is unapplied on
-- Strata):
--   R40  compose_agreement_consent composes from the CLIENT-VISIBLE
--        PROJECTION — the redacted payload the door renders — so the sentence
--        the homeowner ticks is the sentence frozen on her signature row
--        (PART 12b).
--   R43  the closed-book schedule of values is AUTHORED by the studio, not
--        pro-rated from the cost lines. _agreement_schedule_of_values returns
--        the payload's own `scheduleOfValues` under any disclosure that is not
--        open_book; _validate_pricing_basis_payload holds those lines to the
--        contract sum; and send_commercial_document refuses a closed book that
--        carries none. This is RC-4's answer: a uniform multiple is invertible
--        from one (cost, line) pair, and the allowance parts publish such a
--        pair by design.
--   R45  every function this file adds pins its search_path.
--
-- Every value widened below lives in a TEXT CHECK constraint, not a Postgres
-- ENUM type (verified: proposals.document_kind 00423:93-101,
-- project_commercial_documents.document_kind 00423:110-133,
-- proposal_service_terms.billing_cadence 00412:77-78,
-- project_billing_authorities.billing_cadence 00412:148) — so the widening and
-- its first use legally share one transaction and the "ADD VALUE in its own
-- migration" rule does not apply here.
--
-- Adds GRANT/REVOKE -> regenerate seed/00-legacy-grants.sql after this file.
-- Re-pins every hardened body it redefines in
--   supabase/tests/edge_api/public_sd_hardening_contract_test.sql.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════
-- PART 1 — Vocabulary: the sixth kind
--
-- proposals_document_kind_check was named explicitly by 00412 and re-added by
-- name at 00423:93-101, so it is dropped by name. The commercial-document
-- CHECK was written INLINE (00412:115-117), so the server named it; 00423
-- answers that with discovery-by-definition and this file copies that DO block
-- rather than trusting the 00423-assigned name to have survived a rebuild.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.proposals
  DROP CONSTRAINT IF EXISTS proposals_document_kind_check;
ALTER TABLE public.proposals
  ADD CONSTRAINT proposals_document_kind_check CHECK (
    document_kind IN (
      'legacy', 'design_services', 'furnishings_authorization',
      'service_addendum', 'trade_scope', 'design_build'
    ));

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.project_commercial_documents'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%document_kind%'
      AND pg_get_constraintdef(oid) ILIKE '%design_services%'
  LOOP
    EXECUTE format(
      'ALTER TABLE public.project_commercial_documents DROP CONSTRAINT %I',
      r.conname);
  END LOOP;
END $$;

ALTER TABLE public.project_commercial_documents
  ADD CONSTRAINT project_commercial_documents_document_kind_check CHECK (
    document_kind IN (
      'design_services', 'furnishings_authorization',
      'service_addendum', 'trade_scope', 'design_build'
    ));

-- ═══════════════════════════════════════════════════════════════════════════
-- PART 2 — 'per_draw' cadence, and the nullable ceiling on the authority
--
-- Both cadence CHECKs are inline and unnamed (proposal_service_terms
-- 00412:77-78, project_billing_authorities 00412:148), so each is found by its
-- definition and re-added by name.
--
-- A design-build agreement carries no rate card, so under 00575's relaxed rule
-- it carries no ceiling either — and the authority row snapshotted at
-- countersign has to be able to hold NULL. 00575 dropped NOT NULL on both
-- sides (F-2); the guard below is a no-op there and a repair anywhere the
-- authority side is still NOT NULL.
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.proposal_service_terms'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%billing_cadence%'
      AND pg_get_constraintdef(oid) ILIKE '%biweekly%'
  LOOP
    EXECUTE format(
      'ALTER TABLE public.proposal_service_terms DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;

ALTER TABLE public.proposal_service_terms
  ADD CONSTRAINT proposal_service_terms_billing_cadence_check CHECK (
    billing_cadence IN ('monthly', 'biweekly', 'milestone', 'per_draw'));

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.project_billing_authorities'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%billing_cadence%'
      AND pg_get_constraintdef(oid) ILIKE '%biweekly%'
  LOOP
    EXECUTE format(
      'ALTER TABLE public.project_billing_authorities DROP CONSTRAINT %I',
      r.conname);
  END LOOP;
END $$;

ALTER TABLE public.project_billing_authorities
  ADD CONSTRAINT project_billing_authorities_billing_cadence_check CHECK (
    billing_cadence IN ('monthly', 'biweekly', 'milestone', 'per_draw'));

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public'
               AND table_name = 'project_billing_authorities'
               AND column_name = 'billing_ceiling_cents'
               AND is_nullable = 'NO') THEN
    ALTER TABLE public.project_billing_authorities
      ALTER COLUMN billing_ceiling_cents DROP NOT NULL;
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- PART 3 — public.studio_license_attestations (P10, R10)
--
-- SELF-ATTESTED. Patina stores this and Patina does not verify it: there is no
-- registry lookup, no expiry cron, no "verified" state, and there never will
-- be one behind this table. What it does is gate SELECTION of the design-build
-- template, at the two doors that are load-bearing (PART 8's materialize and
-- PART 11's send) and at one that is a courtesy (the picker).
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.studio_license_attestations (
  studio_id         uuid PRIMARY KEY
                      REFERENCES public.organizations(id) ON DELETE CASCADE,
  credential_type   text NOT NULL
                      CHECK (char_length(btrim(credential_type)) > 0),
  credential_number text NOT NULL
                      CHECK (char_length(btrim(credential_number)) > 0),
  state             text NOT NULL CHECK (state ~ '^[A-Z]{2}$'),
  expires_on        date NOT NULL,
  attested_by       uuid NOT NULL
                      REFERENCES public.profiles(id) ON DELETE RESTRICT,
  attested_at       timestamptz NOT NULL DEFAULT now(),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.studio_license_attestations IS
  'One self-attested contractor credential per studio (R10). Patina stores the statement and never verifies it against any registry, API or state board; a live row is what makes the patina.design_build template selectable and sendable, and nothing more.';
COMMENT ON COLUMN public.studio_license_attestations.credential_type IS
  'Free text, deliberately un-CHECKed: the vocabulary is code-resident in packages/types/src/agreement.ts (LICENSE_CREDENTIAL_TYPES), the studio_contacts.contact_kind doctrine (00417:87, :130-135). A new state''s licence name must not need a migration.';

DROP TRIGGER IF EXISTS set_updated_at_studio_license_attestations
  ON public.studio_license_attestations;
CREATE TRIGGER set_updated_at_studio_license_attestations
  BEFORE UPDATE ON public.studio_license_attestations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.studio_license_attestations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS studio_license_attestations_member_select
  ON public.studio_license_attestations;
CREATE POLICY studio_license_attestations_member_select
  ON public.studio_license_attestations FOR SELECT TO authenticated
  USING (public.is_active_studio_member(studio_id));

DROP POLICY IF EXISTS studio_license_attestations_admin_insert
  ON public.studio_license_attestations;
CREATE POLICY studio_license_attestations_admin_insert
  ON public.studio_license_attestations FOR INSERT TO authenticated
  WITH CHECK (public.is_org_admin_or_owner(studio_id, auth.uid()));

DROP POLICY IF EXISTS studio_license_attestations_admin_update
  ON public.studio_license_attestations;
CREATE POLICY studio_license_attestations_admin_update
  ON public.studio_license_attestations FOR UPDATE TO authenticated
  USING (public.is_org_admin_or_owner(studio_id, auth.uid()))
  WITH CHECK (public.is_org_admin_or_owner(studio_id, auth.uid()));

-- No DELETE policy and no DELETE grant: an attestation is the record of a
-- statement somebody made, not a draft (the studio_contacts posture, 00417).
REVOKE ALL ON TABLE public.studio_license_attestations
  FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.studio_license_attestations
  TO authenticated;
GRANT ALL ON TABLE public.studio_license_attestations TO service_role;

CREATE OR REPLACE FUNCTION public.studio_has_live_license_attestation(
  p_studio_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT p_studio_id IS NOT NULL
     AND EXISTS (
           SELECT 1 FROM public.studio_license_attestations a
           WHERE a.studio_id = p_studio_id
             AND a.expires_on > current_date
         );
$$;
COMMENT ON FUNCTION public.studio_has_live_license_attestation(uuid) IS
  'True when the studio has an unexpired self-attested credential on file (R10). Never a verification — only a statement, and only whether it has lapsed.';
REVOKE ALL ON FUNCTION public.studio_has_live_license_attestation(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.studio_has_live_license_attestation(uuid)
  TO authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- PART 4 — public.agreement_jurisdiction_notices (P11, R11)
--
-- SEEDED AND DARK. All six rows land enabled = false, no studio surface can
-- flip one, and RLS shows an authenticated reader only the enabled rows — so
-- until counsel reviews them the table reads as empty to every studio. The
-- send door (PART 11) refuses an agreement that attaches a disabled notice, so
-- a hand-made part cannot smuggle one onto a client's page either.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.agreement_jurisdiction_notices (
  state      text PRIMARY KEY CHECK (state ~ '^[A-Z]{2}$'),
  kind       text NOT NULL CHECK (char_length(btrim(kind)) > 0),
  title      text NOT NULL CHECK (char_length(btrim(title)) > 0),
  body       text NOT NULL CHECK (char_length(btrim(body)) > 0),
  citation   text NOT NULL CHECK (char_length(btrim(citation)) > 0),
  enabled    boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.agreement_jurisdiction_notices IS
  'Per-state cancellation and mandated-contents notices, seeded DISABLED (R11). Only a super_admin may enable one and no UI ships to do it; a disabled row is invisible to every studio, unattachable in the composer, and refused at send.';
COMMENT ON COLUMN public.agreement_jurisdiction_notices.kind IS
  'Free text, code-resident vocabulary: cancellation_notice | mandated_contents. Same doctrine as studio_contacts.contact_kind (00417).';

ALTER TABLE public.agreement_jurisdiction_notices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS agreement_jurisdiction_notices_enabled_select
  ON public.agreement_jurisdiction_notices;
CREATE POLICY agreement_jurisdiction_notices_enabled_select
  ON public.agreement_jurisdiction_notices FOR SELECT TO authenticated
  USING (enabled);

DROP POLICY IF EXISTS agreement_jurisdiction_notices_admin_all
  ON public.agreement_jurisdiction_notices;
CREATE POLICY agreement_jurisdiction_notices_admin_all
  ON public.agreement_jurisdiction_notices FOR ALL TO authenticated
  USING (public.user_has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.user_has_role(auth.uid(), 'super_admin'));

REVOKE ALL ON TABLE public.agreement_jurisdiction_notices
  FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.agreement_jurisdiction_notices
  TO authenticated;
GRANT ALL ON TABLE public.agreement_jurisdiction_notices TO service_role;

-- ON CONFLICT DO NOTHING, never DO UPDATE: a re-run must not re-disable a row
-- counsel has since turned on.
INSERT INTO public.agreement_jurisdiction_notices
  (state, kind, title, body, citation, enabled)
VALUES
  ('WI', 'cancellation_notice',
   'Notice of Cancellation (Wisconsin)',
   'You may cancel this transaction, without penalty or obligation, within three business days from the date shown on this agreement. If you cancel, any payments made by you under this agreement will be returned within ten days following receipt by the seller of your cancellation notice, and any security interest arising out of the transaction will be cancelled. To cancel, deliver or mail a signed and dated copy of this cancellation notice, or any other written notice, to the studio at the address shown on this agreement before midnight of the third business day.',
   'Wis. Admin. Code ATCP 110', false),
  ('MN', 'cancellation_notice',
   'Notice of Cancellation (Minnesota)',
   'You may cancel this transaction at any time prior to midnight of the third business day after the date of this transaction. Two copies of this notice of cancellation are provided with this agreement. To cancel, mail or deliver a signed and dated copy of this cancellation notice, or any other written notice, to the studio at the address shown on this agreement. If you cancel, any payments made by you under this agreement will be returned within ten days following receipt by the seller of your cancellation notice.',
   'Minn. Stat. 325G.07', false),
  ('IL', 'cancellation_notice',
   'Notice of Cancellation (Illinois)',
   'You may cancel this transaction, without penalty or obligation, within three business days from the date of this agreement. The Illinois Home Repair and Remodeling Act also requires that you be given the pamphlet "Home Repair: Know Your Consumer Rights" before this agreement is signed. To cancel, deliver or mail a signed and dated copy of this cancellation notice, or any other written notice, to the studio at the address shown on this agreement before midnight of the third business day.',
   'Home Repair and Remodeling Act (815 ILCS 513)', false),
  ('CA', 'mandated_contents',
   'Notice of Cancellation (California)',
   'You, the buyer, may cancel this contract at any time prior to midnight of the third business day after the date of this transaction; a buyer who is a senior citizen has five business days. If you cancel, any payments made by you under this contract will be returned within ten days following receipt by the seller of your cancellation notice. California law also requires a home improvement contract to state, among other things, the contractor''s licence number, the approximate start and completion dates, and a schedule of payments stated in dollars and cents and tied to the work performed.',
   'Cal. Bus. & Prof. Code §7159', false),
  ('NY', 'cancellation_notice',
   'Notice of Cancellation (New York)',
   'You may cancel this transaction, without penalty or obligation, within three business days from the date of this agreement. If you cancel, any payments made by you under this agreement will be returned within ten business days following receipt by the contractor of your cancellation notice. Local home improvement contractor licensing rules may impose further requirements on this agreement, including a written contract and a deposit held in trust.',
   'NYC Dept. of Consumer and Worker Protection / local HIC rules', false),
  ('MA', 'cancellation_notice',
   'Notice of Cancellation (Massachusetts)',
   'You may cancel this transaction, without penalty or obligation, within three business days from the date of this agreement. Massachusetts law requires this notice to be given on a separate page from the agreement itself. If you cancel, any payments made by you under this agreement will be returned within the period the statute allows. RESEARCH CAVEAT, CARRIED VERBATIM: the source page returned 403 on re-fetch; this summary is carried from the seed brief and has not been independently re-verified. Counsel reviews this text before it is ever enabled.',
   'M.G.L. c. 142A', false)
ON CONFLICT (state) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════
-- PART 5 — The two machine-owned ledgers (P9, P12)
--
-- The draws themselves are AUTHORED, live in the schedule/draws part payload,
-- freeze at send and are already inside 00575's parts fold in
-- _commercial_document_fingerprint. What is NOT authored is the billing state
-- and the waiver exchange, so those get their own tables and the composer
-- never touches them.
--
-- agreement_draw_invoices is deliberately NOT attached to
-- guard_commercial_authored_child: that guard's rule is "immutable once the
-- proposal leaves draft", which is the opposite of what a billing ledger
-- needs. It gets its own guard instead, in trade_scope_draws' shape.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.agreement_draw_invoices (
  id                  uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  proposal_id         uuid NOT NULL
                        REFERENCES public.proposals(id) ON DELETE CASCADE,
  draw_key            text NOT NULL CHECK (char_length(btrim(draw_key)) > 0),
  sort_order          integer NOT NULL,
  label               text NOT NULL CHECK (char_length(btrim(label)) > 0),
  gross_cents         integer NOT NULL CHECK (gross_cents > 0),
  retainage_cents     integer NOT NULL DEFAULT 0 CHECK (retainage_cents >= 0),
  net_cents           integer NOT NULL CHECK (net_cents > 0),
  is_retainage_release boolean NOT NULL DEFAULT false,
  invoice_id          uuid REFERENCES public.invoices(id) ON DELETE SET NULL,
  issued_at           timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT agreement_draw_invoices_net
    CHECK (net_cents = gross_cents - retainage_cents)
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_agreement_draw_key
  ON public.agreement_draw_invoices(proposal_id, draw_key);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_agreement_draw_sort
  ON public.agreement_draw_invoices(proposal_id, sort_order);

COMMENT ON TABLE public.agreement_draw_invoices IS
  'The billing state of a design-build draw schedule: one row per draw plus one computed retainage-release row, materialized at send from the frozen draws payload by send_commercial_document and written by nothing else. Machine state, outside the document fingerprint on purpose (RC-8): the authored draw lives in proposal_agreement_parts.';

CREATE TABLE IF NOT EXISTS public.agreement_draw_lien_waivers (
  id                   uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  draw_id              uuid NOT NULL
                         REFERENCES public.agreement_draw_invoices(id)
                         ON DELETE CASCADE,
  contact_id           uuid REFERENCES public.studio_contacts(id)
                         ON DELETE SET NULL,
  contact_display_name text,
  waiver_type          text NOT NULL
                         CHECK (char_length(btrim(waiver_type)) > 0),
  through_date         date,
  amount_cents         integer
                         CHECK (amount_cents IS NULL OR amount_cents >= 0),
  storage_path         text,
  received_at          timestamptz,
  recorded_by          uuid NOT NULL
                         REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agreement_draw_lien_waivers_draw
  ON public.agreement_draw_lien_waivers(draw_id, created_at DESC);

COMMENT ON COLUMN public.agreement_draw_lien_waivers.waiver_type IS
  'Free text, code-resident vocabulary (LIEN_WAIVER_TYPES): conditional_progress | unconditional_progress | conditional_final | unconditional_final. The 00417 doctrine again.';
COMMENT ON COLUMN public.agreement_draw_lien_waivers.contact_display_name IS
  'Snapshot of the trade''s name at the moment the waiver was recorded. The record outlives the roster row (trade_scope_terms'' rule, 00423:139-143).';
COMMENT ON COLUMN public.agreement_draw_lien_waivers.storage_path IS
  'Media-bucket path of the filed waiver. NULL means the exchange was RECORDED and the paper was not filed here — which is a real state, not a missing one.';

CREATE OR REPLACE FUNCTION public.guard_agreement_draw_ledger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP IN ('INSERT', 'DELETE') THEN
    IF current_user IS DISTINCT FROM 'postgres' THEN
      RAISE EXCEPTION 'a draw schedule is laid out when the agreement is sent, and only then'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  IF current_user IS DISTINCT FROM 'postgres' THEN
    RAISE EXCEPTION 'a draw is billed through issue_agreement_draw_invoice, never written directly'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.proposal_id IS DISTINCT FROM OLD.proposal_id
     OR NEW.draw_key IS DISTINCT FROM OLD.draw_key
     OR NEW.sort_order IS DISTINCT FROM OLD.sort_order
     OR NEW.label IS DISTINCT FROM OLD.label
     OR NEW.gross_cents IS DISTINCT FROM OLD.gross_cents
     OR NEW.retainage_cents IS DISTINCT FROM OLD.retainage_cents
     OR NEW.net_cents IS DISTINCT FROM OLD.net_cents
     OR NEW.is_retainage_release IS DISTINCT FROM OLD.is_retainage_release
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'the money on a sent draw schedule is frozen; only its invoice may move'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_agreement_draw_ledger()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS a_guard_agreement_draw_ledger_trg
  ON public.agreement_draw_invoices;
CREATE TRIGGER a_guard_agreement_draw_ledger_trg
  BEFORE INSERT OR UPDATE OR DELETE ON public.agreement_draw_invoices
  FOR EACH ROW EXECUTE FUNCTION public.guard_agreement_draw_ledger();

DROP TRIGGER IF EXISTS set_updated_at_agreement_draw_invoices
  ON public.agreement_draw_invoices;
CREATE TRIGGER set_updated_at_agreement_draw_invoices
  BEFORE UPDATE ON public.agreement_draw_invoices
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.agreement_draw_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agreement_draw_lien_waivers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS agreement_draw_invoices_studio_select
  ON public.agreement_draw_invoices;
CREATE POLICY agreement_draw_invoices_studio_select
  ON public.agreement_draw_invoices FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.proposals p
    WHERE p.id = agreement_draw_invoices.proposal_id
      AND public.is_studio_comember(p.designer_id)
  ));

DROP POLICY IF EXISTS agreement_draw_lien_waivers_studio_select
  ON public.agreement_draw_lien_waivers;
CREATE POLICY agreement_draw_lien_waivers_studio_select
  ON public.agreement_draw_lien_waivers FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.agreement_draw_invoices d
    JOIN public.proposals p ON p.id = d.proposal_id
    WHERE d.id = agreement_draw_lien_waivers.draw_id
      AND public.is_studio_comember(p.designer_id)
  ));

-- There is NO INSERT policy and NO INSERT grant on the waiver ledger. The
-- program rule for this build is that no wave writes a business table outside
-- a definer RPC, and a waiver is exactly the kind of row that proves why:
-- waiver_type is free text by the 00417 doctrine, so only a function can hold
-- it to the four types anyone means; the trade's name has to be SNAPSHOTTED at
-- the moment of recording; and the recorder is the session, never a column the
-- caller fills in. PART 5b is that door.
DROP POLICY IF EXISTS agreement_draw_lien_waivers_studio_write
  ON public.agreement_draw_lien_waivers;

-- The client reads NEITHER table directly. Her edge onto the draw ledger is
-- the bundle projection in PART 12, and the waiver rows reach her as a
-- {type, receivedAt} pair and nothing else.
REVOKE ALL ON TABLE public.agreement_draw_invoices
  FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.agreement_draw_invoices TO authenticated;
GRANT ALL ON TABLE public.agreement_draw_invoices TO service_role;

REVOKE ALL ON TABLE public.agreement_draw_lien_waivers
  FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.agreement_draw_lien_waivers TO authenticated;
GRANT ALL ON TABLE public.agreement_draw_lien_waivers TO service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- PART 5b — record_agreement_draw_lien_waiver (P12): the waiver's one door
--
-- The studio records the exchange it had with a trade against a draw. Patina
-- neither issues nor countersigns the waiver — it records that one was given,
-- of which kind, by whom, and when — so this RPC validates the vocabulary,
-- resolves the trade against the studio's own roster, and stamps the recorder
-- from auth.uid().
--
-- The homeowner never reaches this row: the bundle projects {type, receivedAt}
-- and nothing else (R13's discipline applied to a document she is entitled to
-- know was exchanged, not to its amount or its paper).
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.record_agreement_draw_lien_waiver(
  p_draw_id uuid,
  p_waiver_type text,
  p_contact_id uuid DEFAULT NULL,
  p_through_date date DEFAULT NULL,
  p_amount_cents integer DEFAULT NULL,
  p_storage_path text DEFAULT NULL,
  p_received_at timestamptz DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_draw public.agreement_draw_invoices%ROWTYPE;
  v_proposal public.proposals%ROWTYPE;
  v_type text := lower(btrim(COALESCE(p_waiver_type, '')));
  v_studio_id uuid;
  v_contact public.studio_contacts%ROWTYPE;
  v_name text;
  v_row public.agreement_draw_lien_waivers%ROWTYPE;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'draw % not found or access denied', p_draw_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_draw FROM public.agreement_draw_invoices
  WHERE id = p_draw_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'draw % not found or access denied', p_draw_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_proposal FROM public.proposals WHERE id = v_draw.proposal_id;
  IF NOT FOUND OR NOT public.is_studio_comember(v_proposal.designer_id) THEN
    RAISE EXCEPTION 'draw % not found or access denied', p_draw_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- LIEN_WAIVER_TYPES (packages/types/src/agreement.ts). The column carries
  -- free text so the vocabulary can live in one place in code; the door is
  -- where that vocabulary is enforced, and the sentence is the studio's.
  IF v_type NOT IN ('conditional_progress', 'unconditional_progress',
                    'conditional_final', 'unconditional_final') THEN
    RAISE EXCEPTION 'a lien waiver is conditional or unconditional, on progress or final'
      USING ERRCODE = 'check_violation';
  END IF;

  IF p_amount_cents IS NOT NULL AND p_amount_cents < 0 THEN
    RAISE EXCEPTION 'a lien waiver cannot be for less than nothing'
      USING ERRCODE = 'check_violation';
  END IF;

  IF p_contact_id IS NOT NULL THEN
    v_studio_id := public._agreement_studio_id(v_draw.proposal_id, v_actor);
    SELECT * INTO v_contact FROM public.studio_contacts
    WHERE id = p_contact_id
      AND organization_id IS NOT DISTINCT FROM v_studio_id
      AND archived_at IS NULL;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'that trade is not on this studio''s roster'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    v_name := COALESCE(
      NULLIF(btrim(COALESCE(v_contact.full_name, '')), ''),
      NULLIF(btrim(COALESCE(v_contact.company_name, '')), ''),
      'This trade');
  END IF;

  INSERT INTO public.agreement_draw_lien_waivers (
    draw_id, contact_id, contact_display_name, waiver_type, through_date,
    amount_cents, storage_path, received_at, recorded_by
  ) VALUES (
    v_draw.id, p_contact_id, v_name, v_type, p_through_date,
    p_amount_cents, NULLIF(btrim(COALESCE(p_storage_path, '')), ''),
    -- Recording an exchange means it happened: a waiver with no date is a
    -- waiver the ledger cannot tell the homeowner she has (PART 12 reads
    -- received_at), so the moment of recording is the default.
    COALESCE(p_received_at, now()), v_actor
  ) RETURNING * INTO v_row;

  RETURN jsonb_build_object(
    'id', v_row.id,
    'drawId', v_row.draw_id,
    'drawKey', v_draw.draw_key,
    'waiverType', v_row.waiver_type,
    'contactDisplayName', v_row.contact_display_name,
    'throughDate', v_row.through_date,
    'amountCents', v_row.amount_cents,
    'receivedAt', v_row.received_at);
END;
$$;
COMMENT ON FUNCTION public.record_agreement_draw_lien_waiver(
  uuid, text, uuid, date, integer, text, timestamptz) IS
  'Records the lien-waiver exchange for one design-build draw (P12). The only writer of agreement_draw_lien_waivers: it holds waiver_type to LIEN_WAIVER_TYPES, snapshots the trade''s name off the studio''s roster, and stamps recorded_by from the session.';
REVOKE ALL ON FUNCTION public.record_agreement_draw_lien_waiver(
  uuid, text, uuid, date, integer, text, timestamptz)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.record_agreement_draw_lien_waiver(
  uuid, text, uuid, date, integer, text, timestamptz)
  TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- PART 6 — Payload validation (R5, R9, research 02 §9 item 6)
--
-- Four functions, each returning text: NULL when the payload is good, and
-- otherwise THE SENTENCE A DESIGNER READS. One message serves the DB refusal,
-- the composer's readiness panel and the test, so the three can never drift.
--
-- They are called from TWO doors: upsert_agreement_parts, so the composer
-- cannot save an invalid payload, and send_commercial_document, so nothing
-- that skipped the composer reaches a client.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public._agreement_is_int(p_value jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT jsonb_typeof(p_value) = 'number'
     AND (p_value #>> '{}')::numeric = trunc((p_value #>> '{}')::numeric);
$$;
REVOKE ALL ON FUNCTION public._agreement_is_int(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._agreement_is_int(jsonb)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public._validate_pricing_basis_payload(
  p_payload jsonb)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_basis text;
  v_line jsonb;
  v_sum bigint := 0;
  v_count integer := 0;
  v_ids text[] := ARRAY[]::text[];
  v_id text;
  v_fee_bps numeric;
  v_contract bigint;
  v_sov bigint := 0;
BEGIN
  IF jsonb_typeof(COALESCE(p_payload, 'null'::jsonb)) <> 'object' THEN
    RETURN 'The pricing basis could not be read.';
  END IF;

  v_basis := NULLIF(btrim(COALESCE(p_payload->>'basis', '')), '');
  IF v_basis IS NULL
     OR v_basis NOT IN ('fixed', 'cost_plus', 'cost_plus_gmp', 'tm_nte') THEN
    RETURN 'Choose a pricing basis: fixed price, cost-plus, cost-plus with a guaranteed maximum, or time and materials with a not-to-exceed.';
  END IF;

  IF jsonb_typeof(p_payload->'costLines') <> 'array'
     OR jsonb_array_length(p_payload->'costLines') = 0 THEN
    RETURN 'A pricing basis needs at least one cost line.';
  END IF;

  FOR v_line IN SELECT value FROM jsonb_array_elements(p_payload->'costLines')
  LOOP
    v_count := v_count + 1;
    IF jsonb_typeof(v_line) <> 'object' THEN
      RETURN 'A cost line could not be read.';
    END IF;
    v_id := NULLIF(btrim(COALESCE(v_line->>'id', '')), '');
    IF v_id IS NULL THEN
      RETURN 'Every cost line needs an identifier.';
    END IF;
    IF v_id = ANY (v_ids) THEN
      RETURN 'The cost lines list "' || v_id || '" twice.';
    END IF;
    v_ids := v_ids || v_id;
    IF btrim(COALESCE(v_line->>'label', '')) = '' THEN
      RETURN 'Every cost line needs a name.';
    END IF;
    IF COALESCE(v_line->>'category', '')
       NOT IN ('sub', 'general_conditions', 'allowance') THEN
      RETURN 'Every cost line is a trade, general conditions, or an allowance.';
    END IF;
    IF NOT public._agreement_is_int(v_line->'basisCents')
       OR (v_line->>'basisCents')::numeric <= 0 THEN
      RETURN 'Every cost line needs an amount above zero.';
    END IF;
    v_sum := v_sum + (v_line->>'basisCents')::bigint;
  END LOOP;

  IF NOT public._agreement_is_int(p_payload->'costBasisCents')
     OR (p_payload->>'costBasisCents')::bigint <> v_sum THEN
    RETURN 'The cost basis must equal the cost lines beneath it, to the cent.';
  END IF;

  IF v_basis = 'fixed' THEN
    IF p_payload ? 'feeBps'
       AND jsonb_typeof(p_payload->'feeBps') <> 'null' THEN
      RETURN 'A fixed price carries no separate fee percentage.';
    END IF;
    IF NOT public._agreement_is_int(p_payload->'fixedCents')
       OR (p_payload->>'fixedCents')::bigint <= 0 THEN
      RETURN 'A fixed price needs the contract sum.';
    END IF;
    v_contract := (p_payload->>'fixedCents')::bigint;
  ELSE
    IF NOT public._agreement_is_int(p_payload->'feeBps') THEN
      RETURN 'A cost-plus basis needs a fee percentage.';
    END IF;
    v_fee_bps := (p_payload->>'feeBps')::numeric;
    IF v_fee_bps < 0 OR v_fee_bps > 5000 THEN
      RETURN 'The fee percentage runs from 0% to 50%.';
    END IF;
  END IF;

  IF v_basis = 'cost_plus_gmp' THEN
    IF NOT public._agreement_is_int(p_payload->'gmpCents')
       OR (p_payload->>'gmpCents')::bigint <= 0 THEN
      RETURN 'A guaranteed maximum price basis needs the guaranteed maximum.';
    END IF;
    IF v_sum + round(v_sum * v_fee_bps / 10000.0)::bigint
       <> (p_payload->>'gmpCents')::bigint THEN
      RETURN 'The guaranteed maximum must equal the cost basis plus the fee, to the cent.';
    END IF;
    v_contract := (p_payload->>'gmpCents')::bigint;
  ELSIF v_basis = 'tm_nte' THEN
    IF NOT public._agreement_is_int(p_payload->'nteCents')
       OR (p_payload->>'nteCents')::bigint <= 0 THEN
      RETURN 'A time-and-materials basis needs its not-to-exceed amount.';
    END IF;
    v_contract := (p_payload->>'nteCents')::bigint;
  ELSIF v_basis = 'cost_plus' THEN
    v_contract := v_sum + round(v_sum * v_fee_bps / 10000.0)::bigint;
  END IF;

  IF v_contract IS NULL OR v_contract <= 0 THEN
    RETURN 'This pricing basis names no contract sum.';
  END IF;

  IF p_payload ? 'subMarkupBps'
     AND jsonb_typeof(p_payload->'subMarkupBps') <> 'null' THEN
    IF NOT public._agreement_is_int(p_payload->'subMarkupBps')
       OR (p_payload->>'subMarkupBps')::numeric < 0
       OR (p_payload->>'subMarkupBps')::numeric > 5000 THEN
      RETURN 'The markup on the trades runs from 0% to 50%.';
    END IF;
  END IF;

  IF p_payload ? 'subDisclosure'
     AND jsonb_typeof(p_payload->'subDisclosure') <> 'null'
     AND COALESCE(p_payload->>'subDisclosure', '')
         NOT IN ('open_book', 'closed_book') THEN
    RETURN 'Sub pricing is disclosed either open-book or closed-book.';
  END IF;

  -- R43 — THE CLIENT-FACING SCHEDULE OF VALUES, WHEN THE STUDIO HAS WRITTEN
  -- ONE. Judged whenever the key carries lines, in either disclosure, so a
  -- draft that has not been divided up yet is not refused before it is asked
  -- for (the send door asks for it under closed book). The rule is the one the
  -- draw schedule already lives by: the column comes to the contract sum, to
  -- the cent.
  IF jsonb_typeof(p_payload->'scheduleOfValues') = 'array'
     AND jsonb_array_length(p_payload->'scheduleOfValues') > 0 THEN
    v_ids := ARRAY[]::text[];
    v_sov := 0;
    FOR v_line IN
      SELECT value FROM jsonb_array_elements(p_payload->'scheduleOfValues')
    LOOP
      IF jsonb_typeof(v_line) <> 'object' THEN
        RETURN 'A schedule-of-values line could not be read.';
      END IF;
      v_id := NULLIF(btrim(COALESCE(v_line->>'id', '')), '');
      IF v_id IS NULL THEN
        RETURN 'Every schedule-of-values line needs an identifier.';
      END IF;
      IF v_id = ANY (v_ids) THEN
        RETURN 'The schedule of values lists "' || v_id || '" twice.';
      END IF;
      v_ids := v_ids || v_id;
      IF btrim(COALESCE(v_line->>'label', '')) = '' THEN
        RETURN 'Every schedule-of-values line needs a name.';
      END IF;
      IF NOT public._agreement_is_int(v_line->'cents')
         OR (v_line->>'cents')::numeric <= 0 THEN
        RETURN 'Every schedule-of-values line needs an amount above zero.';
      END IF;
      v_sov := v_sov + (v_line->>'cents')::bigint;
    END LOOP;
    IF v_sov <> v_contract THEN
      RETURN 'The schedule of values must come to the contract sum, to the cent.';
    END IF;
  END IF;

  RETURN NULL;
END;
$$;
COMMENT ON FUNCTION public._validate_pricing_basis_payload(jsonb) IS
  'NULL when the pricing basis is sound, else the sentence the designer reads. Four bases only: fixed, cost_plus, cost_plus_gmp, tm_nte (research 02 §2). The cost basis must equal the cost lines beneath it, and — under closed book, where the client-facing schedule of values is authored rather than derived (R43) — that schedule must come to the contract sum.';
REVOKE ALL ON FUNCTION public._validate_pricing_basis_payload(jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._validate_pricing_basis_payload(jsonb)
  TO authenticated, service_role;

-- The contract sum this basis names, in cents, or NULL when it names none.
-- One reader for the send door, the draw materialization and the fee floor, so
-- the three can never compute a different number from the same payload.
CREATE OR REPLACE FUNCTION public._agreement_contract_sum_cents(p_payload jsonb)
RETURNS bigint
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_basis text;
  v_sum bigint;
  v_fee numeric;
BEGIN
  IF jsonb_typeof(COALESCE(p_payload, 'null'::jsonb)) <> 'object' THEN
    RETURN NULL;
  END IF;
  v_basis := NULLIF(btrim(COALESCE(p_payload->>'basis', '')), '');
  IF v_basis = 'fixed' THEN
    RETURN CASE WHEN public._agreement_is_int(p_payload->'fixedCents')
                THEN (p_payload->>'fixedCents')::bigint END;
  ELSIF v_basis = 'cost_plus_gmp' THEN
    RETURN CASE WHEN public._agreement_is_int(p_payload->'gmpCents')
                THEN (p_payload->>'gmpCents')::bigint END;
  ELSIF v_basis = 'tm_nte' THEN
    RETURN CASE WHEN public._agreement_is_int(p_payload->'nteCents')
                THEN (p_payload->>'nteCents')::bigint END;
  ELSIF v_basis = 'cost_plus' THEN
    IF NOT public._agreement_is_int(p_payload->'costBasisCents')
       OR NOT public._agreement_is_int(p_payload->'feeBps') THEN
      RETURN NULL;
    END IF;
    v_sum := (p_payload->>'costBasisCents')::bigint;
    v_fee := (p_payload->>'feeBps')::numeric;
    RETURN v_sum + round(v_sum * v_fee / 10000.0)::bigint;
  END IF;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public._agreement_contract_sum_cents(jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._agreement_contract_sum_cents(jsonb)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public._validate_draws_payload(p_payload jsonb)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_draw jsonb;
  v_keys text[] := ARRAY[]::text[];
  v_key text;
  v_bps_total bigint := 0;
  v_count integer := 0;
  v_retainage numeric;
  v_first jsonb;
  v_pct numeric;
BEGIN
  IF jsonb_typeof(COALESCE(p_payload, 'null'::jsonb)) <> 'object' THEN
    RETURN 'The draw schedule could not be read.';
  END IF;

  IF jsonb_typeof(p_payload->'draws') <> 'array' THEN
    RETURN 'A draw schedule is a list of draws.';
  END IF;
  IF jsonb_array_length(p_payload->'draws') < 2 THEN
    RETURN 'A schedule needs at least a deposit and a separate final draw.';
  END IF;

  IF NOT public._agreement_is_int(p_payload->'retainageBps') THEN
    RETURN 'Retainage is a percentage of each draw.';
  END IF;
  v_retainage := (p_payload->>'retainageBps')::numeric;
  IF v_retainage < 0 OR v_retainage > 1000 THEN
    RETURN 'Retainage runs from 0% to 10%.';
  END IF;

  FOR v_draw IN
    SELECT value FROM jsonb_array_elements(p_payload->'draws')
    ORDER BY COALESCE((value->>'sortOrder')::numeric, 0), (value->>'key')
  LOOP
    v_count := v_count + 1;
    IF v_count = 1 THEN
      v_first := v_draw;
    END IF;
    IF jsonb_typeof(v_draw) <> 'object' THEN
      RETURN 'A draw could not be read.';
    END IF;
    v_key := NULLIF(btrim(COALESCE(v_draw->>'key', '')), '');
    IF v_key IS NULL THEN
      RETURN 'Every draw needs an identifier.';
    END IF;
    IF v_key = ANY (v_keys) THEN
      RETURN 'The schedule lists the draw "' || v_key || '" twice.';
    END IF;
    v_keys := v_keys || v_key;
    IF btrim(COALESCE(v_draw->>'label', '')) = '' THEN
      RETURN 'Every draw needs a name.';
    END IF;
    IF jsonb_typeof(v_draw->'pct') <> 'number' THEN
      RETURN 'Every draw needs a percentage.';
    END IF;
    v_pct := (v_draw->>'pct')::numeric;
    IF round(v_pct * 100) <> v_pct * 100 THEN
      RETURN 'A draw percentage carries at most two decimal places.';
    END IF;
    IF v_pct <= 0 THEN
      RETURN 'Every draw must carry an amount.';
    END IF;
    -- Basis points, never a float comparison.
    v_bps_total := v_bps_total + round(v_pct * 100)::bigint;
    IF jsonb_typeof(v_draw->'retainageApplies') <> 'boolean' THEN
      RETURN 'Say whether retainage is held from every draw.';
    END IF;
    IF NOT public._agreement_is_int(v_draw->'sortOrder') THEN
      RETURN 'The order of the draws could not be read.';
    END IF;
  END LOOP;

  IF v_bps_total <> 10000 THEN
    RETURN 'The draws come to ' || trim(to_char(v_bps_total / 100.0, 'FM999990.00'))
           || '% — they must come to 100%.';
  END IF;

  IF COALESCE(v_first->>'key', '') <> 'deposit' THEN
    RETURN 'The first draw is the deposit, and it is keyed "deposit".';
  END IF;
  IF COALESCE((v_first->>'retainageApplies')::boolean, true) THEN
    RETURN 'Retainage is not held from the deposit.';
  END IF;

  RETURN NULL;
END;
$$;
COMMENT ON FUNCTION public._validate_draws_payload(jsonb) IS
  'NULL when the draw schedule is sound, else the sentence the designer reads. Percentages are compared in basis points, never as floats; gross amounts are derived last-row-takes-the-remainder by _agreement_draw_rows, the identical rule computeDrawAmounts keeps in the browser (project-commerce.ts:997-1009).';
REVOKE ALL ON FUNCTION public._validate_draws_payload(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._validate_draws_payload(jsonb)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public._validate_allowances_payload(
  p_payload jsonb,
  p_pricing_basis jsonb DEFAULT NULL)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_allowance jsonb;
  v_ids text[] := ARRAY[]::text[];
  v_id text;
  v_line jsonb;
BEGIN
  IF jsonb_typeof(COALESCE(p_payload, 'null'::jsonb)) <> 'object' THEN
    RETURN 'The allowances could not be read.';
  END IF;
  IF jsonb_typeof(p_payload->'allowances') <> 'array' THEN
    RETURN 'Allowances are a list.';
  END IF;

  FOR v_allowance IN SELECT value FROM jsonb_array_elements(p_payload->'allowances')
  LOOP
    IF jsonb_typeof(v_allowance) <> 'object' THEN
      RETURN 'An allowance could not be read.';
    END IF;
    v_id := NULLIF(btrim(COALESCE(v_allowance->>'id', '')), '');
    IF v_id IS NULL THEN
      RETURN 'Every allowance needs an identifier.';
    END IF;
    IF v_id = ANY (v_ids) THEN
      RETURN 'The allowances list "' || v_id || '" twice.';
    END IF;
    v_ids := v_ids || v_id;
    IF btrim(COALESCE(v_allowance->>'label', '')) = '' THEN
      RETURN 'Every allowance needs a name.';
    END IF;
    IF NOT public._agreement_is_int(v_allowance->'amountCents')
       OR (v_allowance->>'amountCents')::numeric <= 0 THEN
      RETURN 'Every allowance needs an amount above zero.';
    END IF;
    IF COALESCE(v_allowance->>'overageRule', '')
       NOT IN ('change_order', 'client_credit') THEN
      RETURN 'Say what happens when an allowance runs over: a change order, or a credit to the client.';
    END IF;
    IF COALESCE(v_allowance->>'underageRule', '') NOT IN ('credit', 'retain') THEN
      RETURN 'Say what happens when an allowance runs under: credited back, or retained.';
    END IF;

    -- An allowance and its schedule-of-values line are ONE number said twice.
    IF p_pricing_basis IS NOT NULL THEN
      SELECT value INTO v_line
      FROM jsonb_array_elements(
        CASE WHEN jsonb_typeof(p_pricing_basis->'costLines') = 'array'
             THEN p_pricing_basis->'costLines' ELSE '[]'::jsonb END)
      WHERE value->>'id' = v_id;
      IF v_line IS NULL THEN
        RETURN 'The allowance "' || COALESCE(v_allowance->>'label', v_id)
               || '" has no cost line beside it.';
      END IF;
      IF COALESCE(v_line->>'category', '') <> 'allowance' THEN
        RETURN 'The cost line for "' || COALESCE(v_allowance->>'label', v_id)
               || '" is not marked as an allowance.';
      END IF;
      IF (v_line->>'basisCents')::numeric
         IS DISTINCT FROM (v_allowance->>'amountCents')::numeric THEN
        RETURN 'The allowance "' || COALESCE(v_allowance->>'label', v_id)
               || '" and its cost line must be the same number.';
      END IF;
    END IF;
  END LOOP;

  RETURN NULL;
END;
$$;
COMMENT ON FUNCTION public._validate_allowances_payload(jsonb, jsonb) IS
  'NULL when the allowances are sound, else the sentence the designer reads. The second argument is the pricing basis: an allowance and its schedule-of-values line are one number said twice, and the cross-check is the only place that can say so. Called with one argument the shape is still checked; the send door always passes both.';
REVOKE ALL ON FUNCTION public._validate_allowances_payload(jsonb, jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._validate_allowances_payload(jsonb, jsonb)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public._validate_no_double_count(p_parts jsonb)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_part jsonb;
  v_payload jsonb;
  v_supervision numeric := 0;
  v_markup numeric := 0;
BEGIN
  IF jsonb_typeof(COALESCE(p_parts, 'null'::jsonb)) <> 'array' THEN
    RETURN NULL;
  END IF;

  FOR v_part IN SELECT value FROM jsonb_array_elements(p_parts)
  LOOP
    IF jsonb_typeof(v_part) <> 'object' THEN
      CONTINUE;
    END IF;
    v_payload := COALESCE(v_part->'payload', '{}'::jsonb);
    IF jsonb_typeof(v_payload) <> 'object' THEN
      CONTINUE;
    END IF;
    IF jsonb_typeof(v_payload->'supervisionFeeCents') = 'number' THEN
      v_supervision := GREATEST(
        v_supervision, (v_payload->>'supervisionFeeCents')::numeric);
    END IF;
    IF jsonb_typeof(v_payload->'supervisionFeeBps') = 'number' THEN
      v_supervision := GREATEST(
        v_supervision, (v_payload->>'supervisionFeeBps')::numeric);
    END IF;
    IF jsonb_typeof(v_payload->'subMarkupBps') = 'number' THEN
      v_markup := GREATEST(v_markup, (v_payload->>'subMarkupBps')::numeric);
    END IF;
  END LOOP;

  IF v_supervision > 0 AND v_markup > 0 THEN
    RETURN 'Supervision is paid once. You have a supervision fee and a markup on the trades. Bill supervision as its own line, fold it into overhead, or take it in the trade markup — one of the three, not two.';
  END IF;

  RETURN NULL;
END;
$$;
COMMENT ON FUNCTION public._validate_no_double_count(jsonb) IS
  'The no-double-count rule (research 02 §3, §9 item 6): a supervision fee AND a markup on the trades charge twice for one oversight. Enforced at the template level, not left to drafting — the composer, upsert_agreement_parts and send_commercial_document all read this one sentence.';
REVOKE ALL ON FUNCTION public._validate_no_double_count(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._validate_no_double_count(jsonb)
  TO authenticated, service_role;

-- The part set as an array, in the shape upsert_agreement_parts is handed, so
-- send_commercial_document can ask _validate_no_double_count the same question
-- about a frozen set that the composer asked about a proposed one.
CREATE OR REPLACE FUNCTION public._agreement_parts_json(p_proposal_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'kind', ap.kind, 'variant', ap.variant, 'partKey', ap.part_key,
    'title', ap.title, 'payload', ap.payload,
    'required', ap.required, 'clientVisible', ap.client_visible
  ) ORDER BY ap.position, ap.id), '[]'::jsonb)
  FROM public.proposal_agreement_parts ap
  WHERE ap.proposal_id = p_proposal_id;
$$;
REVOKE ALL ON FUNCTION public._agreement_parts_json(uuid)
  FROM PUBLIC, anon, authenticated, service_role;

-- The gross / retainage / net rows a draws payload describes, against a
-- contract sum. LAST ROW TAKES THE REMAINDER, so the schedule sums to the
-- contract sum to the penny — computeDrawAmounts' rule
-- (project-commerce.ts:997-1009), said once in SQL and once in TypeScript and
-- pinned to the same fixture on both sides.
CREATE OR REPLACE FUNCTION public._agreement_draw_rows(
  p_draws jsonb,
  p_contract_sum_cents bigint)
RETURNS TABLE(
  draw_key text,
  label text,
  sort_order integer,
  gross_cents integer,
  retainage_cents integer,
  net_cents integer,
  is_retainage_release boolean)
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_retainage_bps numeric := COALESCE(
    NULLIF(p_draws->>'retainageBps', '')::numeric, 0);
  v_draw jsonb;
  v_n integer;
  v_i integer := 0;
  v_head bigint := 0;
  v_gross bigint;
  v_ret bigint;
  v_ret_total bigint := 0;
  v_max_sort integer := 0;
BEGIN
  IF jsonb_typeof(COALESCE(p_draws, 'null'::jsonb)) <> 'object'
     OR jsonb_typeof(p_draws->'draws') <> 'array'
     OR p_contract_sum_cents IS NULL THEN
    RETURN;
  END IF;
  v_n := jsonb_array_length(p_draws->'draws');

  FOR v_draw IN
    SELECT value FROM jsonb_array_elements(p_draws->'draws')
    ORDER BY COALESCE((value->>'sortOrder')::numeric, 0), (value->>'key')
  LOOP
    v_i := v_i + 1;
    IF v_i < v_n THEN
      v_gross := round(
        p_contract_sum_cents * (v_draw->>'pct')::numeric / 100.0)::bigint;
      v_head := v_head + v_gross;
    ELSE
      v_gross := p_contract_sum_cents - v_head;
    END IF;

    v_ret := CASE
      WHEN COALESCE((v_draw->>'retainageApplies')::boolean, false)
      THEN round(v_gross * v_retainage_bps / 10000.0)::bigint
      ELSE 0 END;
    v_ret_total := v_ret_total + v_ret;
    v_max_sort := GREATEST(v_max_sort, v_i);

    draw_key := v_draw->>'key';
    label := v_draw->>'label';
    sort_order := v_i;
    gross_cents := v_gross::integer;
    retainage_cents := v_ret::integer;
    net_cents := (v_gross - v_ret)::integer;
    is_retainage_release := false;
    RETURN NEXT;
  END LOOP;

  -- The release row exists if and only if retainage was withheld.
  IF v_ret_total > 0 THEN
    draw_key := 'retainage_release';
    label := 'Final · retainage release';
    sort_order := v_max_sort + 1;
    gross_cents := v_ret_total::integer;
    retainage_cents := 0;
    net_cents := v_ret_total::integer;
    is_retainage_release := true;
    RETURN NEXT;
  END IF;
END;
$$;
COMMENT ON FUNCTION public._agreement_draw_rows(jsonb, bigint) IS
  'The draw ledger a frozen draws payload describes, against the contract sum the pricing basis names. Last row takes the remainder; retainage is WITHHELD, not billed, so net_cents is what the invoice carries and the release row sums the withheld amounts exactly.';
REVOKE ALL ON FUNCTION public._agreement_draw_rows(jsonb, bigint)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._agreement_draw_rows(jsonb, bigint)
  TO authenticated, service_role;

-- Money to the cent. _agreement_money rounds to whole dollars because that is
-- what money() does in agreement-parts-body.tsx; a turnkey page is different
-- and says so — the Halvorsen deposit is $8,413.40 and the rough-in draw nets
-- $23,978.19, and a homeowner reconciling an invoice against her paper needs
-- both cents. moneyToTheCent (design-build-body.tsx) formats the DOLLARS and
-- appends the cents as the digits they already are; nothing is divided, so
-- nothing can round. Same rule here, so the keepsake and the live page cannot
-- print two figures for one number.
CREATE OR REPLACE FUNCTION public._agreement_money_to_the_cent(p_cents numeric)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT CASE
    WHEN p_cents IS NULL THEN 'Not yet set'
    ELSE
      CASE WHEN trunc(p_cents) < 0 THEN U&'\2212' ELSE '' END
      || '$'
      || to_char(trunc(abs(trunc(p_cents)) / 100), 'FM999,999,999,990')
      || CASE WHEN (abs(trunc(p_cents))::bigint % 100) = 0 THEN ''
              ELSE '.' || lpad((abs(trunc(p_cents))::bigint % 100)::text, 2, '0')
         END
  END;
$$;
REVOKE ALL ON FUNCTION public._agreement_money_to_the_cent(numeric)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._agreement_money_to_the_cent(numeric)
  TO authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- THE SCHEDULE OF VALUES, IN THE DISCLOSURE THE CLAUSE ELECTED (B3, RC-4,
-- R43).
--
--   open_book  — the trades at cost, and the studio's fee as its own line.
--                The two sum to the contract price. This is the disclosure the
--                clause elected, and the only mode in which a per-trade number
--                appears at all. DERIVED from the cost lines.
--   closed_book (and anything that is not open_book, fail-closed) — the lines
--                the STUDIO AUTHORED, and nothing derived from the cost lines
--                at all.
--
-- R43 is why. Pro-rating spreads the fee across every line, which reads like a
-- closed book and is not one: `cost x sum / basis` is a UNIFORM multiple, the
-- allowance parts state their amounts at cost on the same client-visible page,
-- and one such (cost, line) pair hands the reader the multiplier — and with it
-- every trade's price. RC-4 asks that a sub's bid not be backed out of a line,
-- and a derived schedule cannot answer that however it is arranged.
--
-- So under closed book the studio writes the client's lines itself: its own
-- division of the work — a room, a phase, or a single "Construction" line —
-- summing to the contract sum to the cent, which
-- `_validate_pricing_basis_payload` asserts at both doors. Nothing on that
-- table is a cost line times anything.
--
-- Identical arithmetic and identical source to scheduleOfValues() in
-- design-build-body.tsx, so the door, the keepsake and the composer cannot
-- print three tables.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public._agreement_schedule_of_values(
  p_payload jsonb,
  p_disclosure text)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_sum bigint;
  v_basis bigint := 0;
  v_lines jsonb := '[]'::jsonb;
  v_line jsonb;
  v_i integer := 0;
  v_cents bigint;
BEGIN
  IF jsonb_typeof(COALESCE(p_payload, 'null'::jsonb)) <> 'object' THEN
    RETURN '[]'::jsonb;
  END IF;

  -- R43 — CLOSED BOOK IS THE STUDIO'S OWN LINES. Nothing here reads the cost
  -- lines, so nothing on this table divides back into one.
  IF p_disclosure IS DISTINCT FROM 'open_book' THEN
    IF jsonb_typeof(p_payload->'scheduleOfValues') <> 'array' THEN
      RETURN '[]'::jsonb;
    END IF;
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'id', COALESCE(NULLIF(btrim(COALESCE(line->>'id', '')), ''),
                            'line-' || ord::text),
             'label', line->>'label',
             'cents', (line->>'cents')::bigint) ORDER BY ord), '[]'::jsonb)
    INTO v_lines
    FROM jsonb_array_elements(p_payload->'scheduleOfValues')
      WITH ORDINALITY AS e(line, ord)
    WHERE public._agreement_is_int(line->'cents')
      AND NULLIF(btrim(COALESCE(line->>'label', '')), '') IS NOT NULL;
    RETURN v_lines;
  END IF;

  IF jsonb_typeof(p_payload->'costLines') <> 'array' THEN
    RETURN '[]'::jsonb;
  END IF;

  -- A redacted payload carries the sum it was redacted with; an authored one
  -- states it or derives it. One reader either way.
  v_sum := CASE WHEN public._agreement_is_int(p_payload->'contractSumCents')
                THEN (p_payload->>'contractSumCents')::bigint
                ELSE public._agreement_contract_sum_cents(p_payload) END;

  SELECT COALESCE(sum((line->>'basisCents')::bigint), 0)
  INTO v_basis
  FROM jsonb_array_elements(p_payload->'costLines') AS e(line)
  WHERE public._agreement_is_int(line->'basisCents')
    AND NULLIF(btrim(COALESCE(line->>'label', '')), '') IS NOT NULL;

  IF v_sum IS NULL OR v_basis <= 0 THEN
    RETURN '[]'::jsonb;
  END IF;

  FOR v_line IN
    SELECT line FROM jsonb_array_elements(p_payload->'costLines')
      WITH ORDINALITY AS e(line, ord)
    WHERE public._agreement_is_int(line->'basisCents')
      AND NULLIF(btrim(COALESCE(line->>'label', '')), '') IS NOT NULL
    ORDER BY e.ord
  LOOP
    v_i := v_i + 1;
    v_cents := (v_line->>'basisCents')::bigint;
    v_lines := v_lines || jsonb_build_array(jsonb_build_object(
      'id', COALESCE(NULLIF(btrim(COALESCE(v_line->>'id', '')), ''),
                     'line-' || v_i::text),
      'label', v_line->>'label',
      'cents', v_cents));
  END LOOP;

  IF v_sum - v_basis <> 0 THEN
    v_lines := v_lines || jsonb_build_array(jsonb_build_object(
      'id', '__fee',
      'label', 'Design and construction fee',
      'cents', v_sum - v_basis));
  END IF;

  RETURN v_lines;
END;
$$;
COMMENT ON FUNCTION public._agreement_schedule_of_values(jsonb, text) IS
  'The schedule of values a pricing basis describes, in the disclosure mode the sub-disclosure clause elected. The studio''s own authored lines under closed book (R43); the trades at cost with the fee as its own line under open book. The same source and the same arithmetic as scheduleOfValues() in design-build-body.tsx.';
REVOKE ALL ON FUNCTION public._agreement_schedule_of_values(jsonb, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._agreement_schedule_of_values(jsonb, text)
  TO authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- WHAT A CLOSED BOOK CLOSES (B3, R13, RC-4)
--
-- R22 forces the pricing basis to be client-visible — it is a turnkey prime's
-- only fee part, and an agreement that names no fee cannot be signed — so the
-- studio cannot elect closed book by hiding the part. Which means the raw
-- payload was reaching the homeowner with the trades AT COST in costLines, the
-- studio's margin in feeBps, its markup in subMarkupBps and the whole cost
-- basis beside them. A closed book that publishes the book is not closed, and
-- RC-4 asks precisely that a trade's bid not be derivable from her copy.
--
-- So the payload the CLIENT is handed is redacted here, once, at the one edge
-- she reads through: the schedule of values goes over — the studio's own
-- authored lines under closed book (R43), the trades at cost plus the fee
-- under open — and the cost lines, the fee, the markup and the cost basis stay
-- behind. The contract sum is carried explicitly because it is HER number and,
-- once the cost basis is gone, no longer derivable on a plain cost-plus basis.
--
-- Under open book nothing is withheld — that is what the clause elected — and
-- the schedule is projected in the same key so both modes read alike.
--
-- The studio's own surfaces do not read through here: the composer reads
-- proposal_agreement_parts directly, and this redaction sits inside
-- get_client_commercial_document_bundle alone.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public._agreement_redact_client_payload(
  p_kind text,
  p_variant text,
  p_payload jsonb,
  p_disclosure text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_payload jsonb := COALESCE(p_payload, '{}'::jsonb);
  v_sum bigint;
BEGIN
  IF p_kind IS DISTINCT FROM 'schedule'
     OR p_variant IS DISTINCT FROM 'pricing_basis'
     OR jsonb_typeof(v_payload) <> 'object' THEN
    RETURN v_payload;
  END IF;

  v_sum := public._agreement_contract_sum_cents(v_payload);

  v_payload := v_payload || jsonb_build_object(
    'contractSumCents', to_jsonb(v_sum),
    'scheduleOfValues',
      public._agreement_schedule_of_values(v_payload, p_disclosure));

  IF p_disclosure = 'open_book' THEN
    RETURN v_payload;
  END IF;

  RETURN v_payload
    - 'costLines' - 'feeBps' - 'costBasisCents' - 'subMarkupBps';
END;
$$;
COMMENT ON FUNCTION public._agreement_redact_client_payload(text, text, jsonb, text) IS
  'The pricing basis as the homeowner is handed it. Under anything but open book the cost lines, the fee, the sub markup and the cost basis stay behind and the derived schedule of values goes in their place (B3/RC-4). Every other part crosses unchanged.';
REVOKE ALL ON FUNCTION public._agreement_redact_client_payload(text, text, jsonb, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._agreement_redact_client_payload(text, text, jsonb, text)
  TO authenticated, service_role;

-- The one place that answers "which part is the design-build <x>", so the
-- send door, the projection and the client bundle cannot pick different parts.
CREATE OR REPLACE FUNCTION public._agreement_design_build_part(
  p_proposal_id uuid,
  p_variant text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT ap.payload
  FROM public.proposal_agreement_parts ap
  WHERE ap.proposal_id = p_proposal_id
    AND ap.kind = 'schedule'
    AND ap.variant = p_variant
  ORDER BY ap.position, ap.id
  LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public._agreement_design_build_part(uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;

-- The disclosure mode, resolved ONCE for the whole contract (research 02 §9
-- item 5). It is authored on the sub-disclosure clause, where the composer's
-- selector lives (§4.1); the build sheet also allows it inside the pricing
-- basis payload, so both are read and a disagreement is refused rather than
-- silently resolved. NULL means nobody said.
CREATE OR REPLACE FUNCTION public._agreement_sub_disclosure(p_proposal_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_clause text;
  v_basis text;
BEGIN
  SELECT NULLIF(btrim(COALESCE(ap.payload->>'mode', '')), '')
  INTO v_clause
  FROM public.proposal_agreement_parts ap
  WHERE ap.proposal_id = p_proposal_id
    AND ap.kind = 'clause'
    AND NULLIF(btrim(COALESCE(ap.payload->>'mode', '')), '') IS NOT NULL
  ORDER BY ap.position, ap.id
  LIMIT 1;

  v_basis := NULLIF(btrim(COALESCE(
    public._agreement_design_build_part(p_proposal_id, 'pricing_basis')
      ->>'subDisclosure', '')), '');

  IF v_clause IS NOT NULL AND v_basis IS NOT NULL AND v_clause <> v_basis THEN
    RETURN 'conflict';
  END IF;
  RETURN COALESCE(v_clause, v_basis);
END;
$$;
REVOKE ALL ON FUNCTION public._agreement_sub_disclosure(uuid)
  FROM PUBLIC, anon, authenticated, service_role;

-- R13's projection of WHO IS DOING THE WORK, as its own function so the
-- client bundle never names studio_trade_agreements — that table is the NEXT
-- migration's, and a bundle body that referenced it would be unplannable if
-- 00579 ever failed to apply, for every client of every kind. This is the
-- stub; 00579 re-heads it over the real table.
--
-- IDENTITIES ALWAYS, BID LEDGER NEVER. When it is re-headed it projects the
-- trade's display name, company and trade in both disclosure modes, and the
-- AWARDED price only under open_book. trade_scope_bids — studio-only by
-- construction (00423:213) — and every Trade Agreement the studio holds
-- beyond the one it awarded are projected in NEITHER mode, at NO state.
CREATE OR REPLACE FUNCTION public._agreement_design_build_subs(
  p_proposal_id uuid,
  p_disclosure text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT '[]'::jsonb;
$$;
REVOKE ALL ON FUNCTION public._agreement_design_build_subs(uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- PART 7 — upsert_design_services_draft, one value wider
-- 
-- The seven-facet room's writer. A design-build proposal always carries
-- parts, so 00575's agreement_composed refusal is what it will actually
-- meet here — but the kind allowlist is asked FIRST, and a refusal in the
-- words of the wrong door is a refusal a designer cannot act on.
-- ═══════════════════════════════════════════════════════════════════════════

-- Grafted VERBATIM from 00575_agreement_parts.sql:2325-2402, then the delta below.
CREATE OR REPLACE FUNCTION public.upsert_design_services_draft(
  p_proposal_id uuid,
  p_terms jsonb,
  p_rates jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_proposal public.proposals%ROWTYPE;
  v_rate jsonb;
  v_current_version integer := COALESCE((p_terms->>'currentRateVersion')::integer, 1);
  v_previous_commercial text := current_setting('app.commercial_document_id', true);
BEGIN
  IF auth.uid() IS NULL OR jsonb_typeof(COALESCE(p_terms, '{}'::jsonb)) <> 'object'
     OR jsonb_typeof(COALESCE(p_rates, 'null'::jsonb)) <> 'array'
     OR jsonb_array_length(p_rates) = 0
  THEN
    RAISE EXCEPTION 'design-services draft requires an authenticated author, terms, and rates'
      USING ERRCODE = 'check_violation';
  END IF;
  SELECT * INTO v_proposal FROM public.proposals
  WHERE id = p_proposal_id FOR UPDATE;
  IF NOT FOUND OR v_proposal.status <> 'draft'
     OR NOT public._can_author_proposal(v_proposal.designer_id)
  THEN
    RAISE EXCEPTION 'draft proposal % not found or access denied', p_proposal_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_proposal.document_kind NOT IN ('legacy', 'design_services', 'service_addendum', 'design_build') THEN
    RAISE EXCEPTION 'proposal % is not a design-services draft', p_proposal_id
      USING ERRCODE = 'check_violation';
  END IF;

  -- 00575 (R17, N-5). This door authors the terms row. Once the agreement
  -- carries parts, that row is a PROJECTION of them, and authoring it here
  -- would bind the studio to a number the client's page does not show. The
  -- refusal is typed twice over: the MESSAGE is the sentence the flag-off
  -- seven-facet room prints beside a disabled Save, and the DETAIL is the
  -- token a caller branches on. It stands AFTER the access and kind checks,
  -- so a stranger still learns nothing but 'access denied'.
  IF EXISTS (
    SELECT 1 FROM public.proposal_agreement_parts ap
    WHERE ap.proposal_id = p_proposal_id
  ) THEN
    RAISE EXCEPTION 'This agreement is composed from parts. Open it in the Contract Room with parts on to change it.'
      USING ERRCODE = 'check_violation', DETAIL = 'agreement_composed';
  END IF;

  PERFORM set_config('app.commercial_document_id', p_proposal_id::text, true);
  UPDATE public.proposals
  SET document_kind = CASE WHEN document_kind = 'legacy' THEN 'design_services' ELSE document_kind END,
      commercial_state = 'draft', updated_at = now()
  WHERE id = p_proposal_id;

  -- 00575: the projection moved to _project_agreement_terms, verbatim.
  -- Every refusal above, the kind widen, both set_config calls, the return
  -- object and the EXCEPTION restore below are unchanged. false = this door
  -- may not write an uncapped ceiling; 00422's COALESCE(..., 0) still stands
  -- for it.
  PERFORM public._project_agreement_terms(p_proposal_id, p_terms, p_rates, false);

  PERFORM set_config('app.commercial_document_id', COALESCE(v_previous_commercial, ''), true);
  RETURN jsonb_build_object(
    'proposalId', p_proposal_id,
    'documentKind', CASE WHEN v_proposal.document_kind = 'legacy' THEN 'design_services' ELSE v_proposal.document_kind END,
    'commercialState', 'draft',
    'currentRateVersion', v_current_version,
    'rateCount', jsonb_array_length(p_rates),
    'documentFingerprint', public._commercial_document_fingerprint(p_proposal_id)
  );
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('app.commercial_document_id', COALESCE(v_previous_commercial, ''), true);
  RAISE;
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- PART 7a — _agreement_fee_unnamed learns that a pricing basis names a fee
-- 
-- FINDING F-W3-1, not in the build sheet. R22's fee floor is asked at all
-- three doors a document leaves draft by, and it counts only rate_card,
-- flat and per_phase. A turnkey prime carries none of the three, so before
-- this graft EVERY design-build client signature raised 'This agreement
-- names no fee.' — from _sign_design_services_agreement_authorized, after
-- the kind list had already been widened. A pricing basis carrying a
-- contract sum names a fee; that is what R4 means when it says the typed
-- money part for this class is pricing_basis.
-- 
-- The reading stays client_visible-only (R33): a fee the studio kept to
-- itself is not a fee she is being charged on the page she signs.
-- ═══════════════════════════════════════════════════════════════════════════

-- Grafted VERBATIM from 00575_agreement_parts.sql:452-492, then the delta below.
CREATE OR REPLACE FUNCTION public._agreement_fee_unnamed(p_proposal_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
           SELECT 1 FROM public.proposal_agreement_parts ap
           WHERE ap.proposal_id = p_proposal_id
         )
     AND NOT EXISTS (
           SELECT 1
           FROM public.proposal_agreement_parts ap
           WHERE ap.proposal_id = p_proposal_id
             AND ap.client_visible
             AND ap.kind = 'schedule'
             AND (
               (ap.variant = 'rate_card' AND EXISTS (
                  SELECT 1 FROM jsonb_array_elements(
                    CASE WHEN jsonb_typeof(ap.payload->'roles') = 'array'
                         THEN ap.payload->'roles' ELSE '[]'::jsonb END
                  ) AS e(role)
                  WHERE btrim(COALESCE(e.role->>'roleName', '')) <> ''
                    AND jsonb_typeof(e.role->'hourlyRateCents') = 'number'
                    AND (e.role->>'hourlyRateCents')::numeric > 0
                ))
               OR (ap.variant = 'flat'
                   AND jsonb_typeof(ap.payload->'cents') = 'number'
                   AND (ap.payload->>'cents')::numeric > 0)
               OR (ap.variant = 'per_phase' AND EXISTS (
                  SELECT 1 FROM jsonb_array_elements(
                    CASE WHEN jsonb_typeof(ap.payload->'phases') = 'array'
                         THEN ap.payload->'phases' ELSE '[]'::jsonb END
                  ) AS e(phase)
                  WHERE jsonb_typeof(e.phase->'cents') = 'number'
                    AND (e.phase->>'cents')::numeric > 0
                ))
               -- 00578 (F-W3-1): the turnkey class states its fee as a
               -- pricing basis, and a basis that names a contract sum names
               -- a fee. Every other design-build refusal is worded in
               -- send_commercial_document's own arm.
               OR (ap.variant = 'pricing_basis'
                   AND COALESCE(
                         public._agreement_contract_sum_cents(ap.payload), 0)
                       > 0)
             )
         );
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- PART 7b — the signature path (D-W3-3): three pinned grafts, one delta each
-- 
-- A sweep of head-resolved bodies found three refusals that would each
-- silently break a design-build client signature, and all three are
-- body-hash pinned in public_sd_hardening_contract_test.sql. Each is
-- re-pinned in the same change.
-- 
-- (1) _sign_design_services_agreement_authorized refuses the kind outright.
-- (2) guard_commercial_signature_insert refuses the signature ROW even
--     once (1) allows it — a via x document_kind matrix — and its
--     unique-origin-actor leg is design-services-only, so the very first
--     turnkey agreement for a brand-new household could not be
--     countersigned by its origin actor either.
-- (3) app_private.issue_invoice_for_actor scopes the retainer anchor to two
--     kinds, twice in one body. Miss one and a design-build agreement
--     carrying a retainer part fails AT COUNTERSIGN with 'issue_invoice:
--     invoice not found or access denied' — an error that reads like a
--     permission bug and is not one.
-- ═══════════════════════════════════════════════════════════════════════════

-- Grafted VERBATIM from 00577_agreement_fee_schedules.sql:1668-1802, then the delta below.
CREATE OR REPLACE FUNCTION public._sign_design_services_agreement_authorized(
  p_proposal_id uuid,
  p_signed_name text,
  p_client_id uuid,
  p_trusted_signed_ip text,
  p_consent jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_proposal public.proposals%ROWTYPE;
  v_signature public.commercial_document_signatures%ROWTYPE;
  v_name text := btrim(COALESCE(p_signed_name, ''));
  v_ip text := NULLIF(btrim(COALESCE(p_trusted_signed_ip, '')), '');
  v_fingerprint text;
  v_newly_signed boolean := false;
  v_previous_commercial text := current_setting('app.commercial_document_id', true);
BEGIN
  IF p_client_id IS NULL THEN
    RAISE EXCEPTION 'sign_design_services_agreement requires an authenticated client'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF char_length(v_name) < 2 THEN
    RAISE EXCEPTION 'a signature name of at least 2 characters is required'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_proposal FROM public.proposals
  WHERE id = p_proposal_id FOR UPDATE;
  IF NOT FOUND OR v_proposal.client_id IS DISTINCT FROM p_client_id THEN
    RAISE EXCEPTION 'design services agreement % not found or access denied', p_proposal_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_proposal.document_kind NOT IN ('design_services', 'service_addendum', 'design_build') THEN
    RAISE EXCEPTION 'proposal % is not a design services agreement or addendum', p_proposal_id
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_proposal.commercial_state NOT IN ('sent', 'client_signed') THEN
    RAISE EXCEPTION 'design services agreement % is not client-signable (%)',
      p_proposal_id, COALESCE(v_proposal.commercial_state, 'NULL')
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_proposal.valid_until IS NOT NULL AND v_proposal.valid_until < now() THEN
    RAISE EXCEPTION 'design services agreement % has expired', p_proposal_id
      USING ERRCODE = 'check_violation';
  END IF;
  -- 00575: same relaxation as send (A). Terms always; role rates only when
  -- the agreement carries a rate_card part, or carries no parts at all.
  IF NOT EXISTS (SELECT 1 FROM public.proposal_service_terms t WHERE t.proposal_id = p_proposal_id)
     OR (public._agreement_requires_rate_card(p_proposal_id)
         AND NOT EXISTS (SELECT 1 FROM public.proposal_service_rates r WHERE r.proposal_id = p_proposal_id))
  THEN
    RAISE EXCEPTION 'design services agreement requires terms, and at least one role rate whenever a rate card is present'
      USING ERRCODE = 'check_violation';
  END IF;
  -- 00575: and R4's floor, at this door as at the other two.
  IF public._agreement_floor_unmet(p_proposal_id) THEN
    RAISE EXCEPTION 'an agreement that bills time needs a ceiling'
      USING ERRCODE = 'check_violation';
  END IF;
  -- R22: the fee half, asked wherever the ceiling half is asked.
  IF public._agreement_fee_unnamed(p_proposal_id) THEN
    RAISE EXCEPTION 'This agreement names no fee. Add a rate card, a flat fee, or a per-phase fee.'
      USING ERRCODE = 'check_violation';
  END IF;

  v_fingerprint := public._commercial_document_fingerprint(p_proposal_id);
  IF v_fingerprint IS NULL THEN
    RAISE EXCEPTION 'could not fingerprint design services agreement %', p_proposal_id
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_signature FROM public.commercial_document_signatures
  WHERE proposal_id = p_proposal_id AND party_role = 'client'
  FOR UPDATE;

  IF FOUND THEN
    IF v_signature.signer_user_id IS DISTINCT FROM p_client_id
       OR v_signature.signed_name IS DISTINCT FROM v_name
       OR v_signature.evidence_fingerprint IS DISTINCT FROM v_fingerprint
    THEN
      RAISE EXCEPTION 'client signature evidence conflicts with the current agreement fingerprint'
        USING ERRCODE = 'check_violation';
    END IF;
  ELSE
    INSERT INTO public.commercial_document_signatures (
      proposal_id, party_role, signer_user_id, signed_name, signed_ip,
      evidence_fingerprint, metadata
    ) VALUES (
      p_proposal_id, 'client', p_client_id, v_name, v_ip, v_fingerprint,
      -- 00577 (P6): WHAT SHE ACTUALLY CONSENTED TO, frozen with the act.
      -- The sentence comes from the bundle, never from the browser — the
      -- client must not be able to choose what it consented to — and the
      -- acknowledged attachments come with it. Signature rows are immutable
      -- (guard_commercial_immutable_row, 00412:620-631), so this lands at
      -- INSERT or not at all; the idempotent-retry branch above is
      -- deliberately NOT extended to compare consent, so a retry keeps the
      -- first row and the first sentence.
      jsonb_build_object('via', 'sign_design_services_agreement')
      || CASE WHEN jsonb_typeof(COALESCE(p_consent, 'null'::jsonb)) = 'object'
              THEN jsonb_build_object(
                     'consentSentence',
                     NULLIF(btrim(COALESCE(p_consent->>'consentSentence', '')), ''),
                     'attachmentsAcknowledged',
                     CASE WHEN jsonb_typeof(p_consent->'attachmentsAcknowledged') = 'array'
                          THEN p_consent->'attachmentsAcknowledged'
                          ELSE '[]'::jsonb END)
              ELSE '{}'::jsonb END
    ) RETURNING * INTO v_signature;

    PERFORM set_config('app.commercial_document_id', p_proposal_id::text, true);
    UPDATE public.proposals
    SET commercial_state = 'client_signed', updated_at = now()
    WHERE id = p_proposal_id;
    PERFORM set_config('app.commercial_document_id', COALESCE(v_previous_commercial, ''), true);
    v_newly_signed := true;
  END IF;

  RETURN jsonb_build_object(
    'agreementId', p_proposal_id,
    'proposalId', p_proposal_id,
    'commercialState', 'client_signed',
    'projectId', NULL,
    'signatureId', v_signature.id,
    'evidenceFingerprint', v_signature.evidence_fingerprint,
    'newlyClientSigned', v_newly_signed
  );
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('app.commercial_document_id', COALESCE(v_previous_commercial, ''), true);
  RAISE;
END;
$$;

-- Grafted VERBATIM from 00566_commercial_signature_studio_resolution.sql:89-300, then the delta below.
CREATE OR REPLACE FUNCTION public.guard_commercial_signature_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_proposal public.proposals%ROWTYPE;
  v_via text := COALESCE(NEW.metadata->>'via', '');
  v_expected_capability text;
  v_active_role text := COALESCE(current_setting('role', true), 'none');
  v_exact_project_actor boolean := false;
  v_unique_origin_actor boolean := false;
  v_postgres_migration boolean :=
    session_user = 'postgres' AND v_active_role IN ('none', 'postgres');
BEGIN
  -- An invoker trigger sees postgres only while a reviewed owner core is active.
  IF current_user IS DISTINCT FROM 'postgres' THEN
    RAISE EXCEPTION
      'commercial signatures are inserted only by canonical signing RPCs'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_postgres_migration THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_proposal
  FROM public.proposals
  WHERE id = NEW.proposal_id;

  IF FOUND AND v_active_role = 'authenticated' AND auth.uid() IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.project_commercial_documents AS document
      JOIN public.projects AS project ON project.id = document.project_id
      JOIN public.organizations AS studio ON studio.id = project.studio_id
      JOIN public.organization_members AS actor_membership
        ON actor_membership.organization_id = project.studio_id
       AND actor_membership.user_id = auth.uid()
      JOIN public.organization_members AS lead_membership
        ON lead_membership.organization_id = project.studio_id
       AND lead_membership.user_id = project.designer_id
      JOIN public.user_roles AS user_role
        ON user_role.user_id = project.designer_id
      JOIN public.roles AS role ON role.id = user_role.role_id
      WHERE document.proposal_id = v_proposal.id
        AND document.document_kind = v_proposal.document_kind
        AND (
          v_proposal.project_id IS NULL
          OR v_proposal.project_id = project.id
        )
        AND project.client_id = v_proposal.client_id
        AND project.status = 'active'
        AND studio.type = 'design_studio'
        AND studio.status = 'active'
        AND actor_membership.status = 'active'
        AND actor_membership.role <> 'guest'
        AND lead_membership.status = 'active'
        AND lead_membership.role <> 'guest'
        AND role.domain = 'designer'
    ) INTO v_exact_project_actor;

    SELECT v_proposal.document_kind IN ('design_services', 'design_build')
       AND v_proposal.project_id IS NULL
       AND NOT EXISTS (
         SELECT 1
         FROM public.project_commercial_documents AS document
         WHERE document.proposal_id = v_proposal.id
       )
       AND EXISTS (
         SELECT 1
         FROM public.user_roles AS user_role
         JOIN public.roles AS role ON role.id = user_role.role_id
         WHERE user_role.user_id = v_proposal.designer_id
           AND role.domain = 'designer'
       )
       -- 00566. Was `1 = count(DISTINCT studio.id)`: a lead designer and an
       -- actor who shared TWO active studios failed this leg, and a paper
       -- client signature on an origin agreement was refused outright. The
       -- authority question here is shared membership, not its cardinality.
       AND EXISTS (
         SELECT 1
         FROM public.organizations AS studio
         JOIN public.organization_members AS lead_membership
           ON lead_membership.organization_id = studio.id
          AND lead_membership.user_id = v_proposal.designer_id
         JOIN public.organization_members AS actor_membership
           ON actor_membership.organization_id = studio.id
          AND actor_membership.user_id = auth.uid()
         WHERE studio.type = 'design_studio'
           AND studio.status = 'active'
           AND lead_membership.status = 'active'
           AND lead_membership.role <> 'guest'
           AND actor_membership.status = 'active'
           AND actor_membership.role <> 'guest'
       )
    INTO v_unique_origin_actor;
  END IF;
  v_expected_capability := format(
    'commercial_signature:%s:%s:%s',
    NEW.proposal_id, v_via, pg_catalog.txid_current()
  );

  IF NOT FOUND
     OR NEW.party_role NOT IN ('client', 'studio')
     OR current_setting('app.commercial_signature_capability', true)
          IS DISTINCT FROM v_expected_capability
     OR NEW.evidence_fingerprint IS DISTINCT FROM
          public._commercial_document_fingerprint(NEW.proposal_id)
     OR (
       NEW.party_role = 'client'
       AND (
         v_proposal.client_id IS NULL
         OR NEW.signer_user_id IS DISTINCT FROM v_proposal.client_id
         OR v_proposal.commercial_state <> 'sent'
         OR v_via NOT IN (
           'sign_design_services_agreement',
           'record_paper_client_signature',
           'execute_furnishings_authorization',
           'execute_furnishings_authorization_on_paper',
           'execute_trade_scope',
           'execute_trade_scope_on_paper'
         )
         OR NOT (
           (
             v_via IN (
               'sign_design_services_agreement',
               'record_paper_client_signature'
             )
             -- 00578: the turnkey prime reuses this via, so no new
             -- via name enters the system and the OUTER allowlist above is
             -- untouched. Widening here does technically admit a PAPER
             -- client signature on a design-build prime at the guard; the
             -- door stays shut one level down, at
             -- _record_paper_client_signature_impl, deliberately.
             AND v_proposal.document_kind IN (
               'design_services', 'service_addendum', 'design_build'
             )
           )
           OR (
             v_via IN (
               'execute_furnishings_authorization',
               'execute_furnishings_authorization_on_paper'
             )
             AND v_proposal.document_kind = 'furnishings_authorization'
           )
           OR (
             v_via IN (
               'execute_trade_scope', 'execute_trade_scope_on_paper'
             )
             AND v_proposal.document_kind = 'trade_scope'
           )
         )
         OR (
           v_via IN (
             'sign_design_services_agreement',
             'execute_furnishings_authorization',
             'execute_trade_scope'
           )
           AND NOT (
             (
               v_active_role = 'authenticated'
               AND auth.uid() IS NOT NULL
               AND auth.uid() IS NOT DISTINCT FROM NEW.signer_user_id
             )
             OR (
               v_active_role = 'service_role'
               AND NEW.signer_user_id IS NOT DISTINCT FROM
                     v_proposal.client_id
             )
           )
         )
         OR (
           v_via IN (
             'record_paper_client_signature',
             'execute_furnishings_authorization_on_paper',
             'execute_trade_scope_on_paper'
           )
           AND (
             v_active_role <> 'authenticated'
             OR auth.uid() IS NULL
             OR NOT (
               v_exact_project_actor
               OR (
                 v_via = 'record_paper_client_signature'
                 AND v_unique_origin_actor
               )
             )
             OR NEW.signed_ip IS NOT NULL
             OR COALESCE(
                  (NEW.metadata->>'executedOnPaper')::boolean, false
                ) IS NOT TRUE
             OR NEW.metadata->>'recordedBy'
                  IS DISTINCT FROM auth.uid()::text
             OR NULLIF(NEW.metadata->>'paperSignedOn', '') IS NULL
           )
         )
       )
     )
     OR (
       NEW.party_role = 'studio'
       AND (
         v_active_role <> 'authenticated'
         OR v_proposal.commercial_state <> 'client_signed'
         OR NOT (v_exact_project_actor OR v_unique_origin_actor)
         OR NEW.signer_user_id IS DISTINCT FROM auth.uid()
         OR v_via <> 'countersign_design_services_agreement'
       )
     )
  THEN
    RAISE EXCEPTION
      'commercial signature does not match canonical signer/state/evidence'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

-- Grafted VERBATIM from 00511_public_sd_hardening.sql:3713-4096, then the delta below.
CREATE OR REPLACE FUNCTION app_private.issue_invoice_for_actor(
  p_invoice_id uuid,
  p_due_date date,
  p_actor_id uuid
)
RETURNS public.invoices
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_invoice public.invoices%ROWTYPE;
  v_project public.projects%ROWTYPE;
  v_proposal public.proposals%ROWTYPE;
  v_document public.project_commercial_documents%ROWTYPE;
  v_document_id uuid;
  v_proposal_id uuid;
  v_anchor_count integer;
  v_line_count integer;
  v_subtotal bigint;
  v_tax integer;
  v_number integer;
  v_due date;
  v_studio_id uuid;
  -- plpgsql forbids a row variable in a multi-item INTO list, so the paired
  -- composites land in one record and are unpacked below.
  v_admitted record;
BEGIN
  -- Discover only an invoice whose canonical project tuple already admits the
  -- explicit actor; no foreign project or invoice row is locked on denial.
  SELECT invoice, project
  INTO v_admitted
  FROM public.invoices AS invoice
  JOIN public.projects AS project ON project.id = invoice.project_id
  WHERE invoice.id = p_invoice_id
    AND invoice.designer_id = project.designer_id
    AND invoice.client_id = project.client_id
    AND invoice.studio_id = project.studio_id
    AND p_actor_id IS NOT NULL
    AND (
      p_actor_id = invoice.client_id
      OR p_actor_id = project.designer_id
      OR EXISTS (
        SELECT 1
        FROM public.organization_members AS actor_membership
        WHERE actor_membership.organization_id = project.studio_id
          AND actor_membership.user_id = p_actor_id
          AND actor_membership.status = 'active'
          AND actor_membership.role <> 'guest'
      )
    );

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'issue_invoice: invoice not found or access denied'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  v_invoice := v_admitted.invoice;
  v_project := v_admitted.project;

  SELECT project.* INTO v_project
  FROM public.projects AS project
  WHERE project.id = v_project.id
    AND project.designer_id = v_project.designer_id
    AND project.client_id = v_project.client_id
    AND project.studio_id = v_project.studio_id
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION
      'issue_invoice: invoice not found or access denied'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  PERFORM role.id
  FROM public.roles AS role
  WHERE role.domain = 'designer'
  ORDER BY role.id
  FOR SHARE;

  PERFORM user_role.id
  FROM public.user_roles AS user_role
  JOIN public.roles AS role ON role.id = user_role.role_id
  WHERE user_role.user_id = v_project.designer_id
    AND role.domain = 'designer'
  ORDER BY user_role.role_id, user_role.id
  FOR SHARE OF user_role;
  IF NOT FOUND THEN
    RAISE EXCEPTION
      'issue_invoice: invoice not found or access denied'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  PERFORM membership.id
  FROM public.organization_members AS membership
  WHERE membership.organization_id = v_project.studio_id
    AND membership.user_id = ANY(ARRAY[
      v_project.designer_id, p_actor_id
    ]::uuid[])
  ORDER BY membership.user_id, membership.id
  FOR SHARE;

  PERFORM studio.id
  FROM public.organizations AS studio
  WHERE studio.id = v_project.studio_id
  ORDER BY studio.id
  FOR SHARE;

  SELECT invoice.* INTO v_invoice
  FROM public.invoices AS invoice
  WHERE invoice.id = p_invoice_id
    AND invoice.project_id = v_project.id
    AND invoice.designer_id = v_project.designer_id
    AND invoice.client_id = v_project.client_id
    AND invoice.studio_id = v_project.studio_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION
      'issue_invoice: invoice not found or access denied'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  PERFORM line.id
  FROM public.invoice_line_items AS line
  WHERE line.invoice_id = p_invoice_id
  ORDER BY line.id
  FOR SHARE;

  WITH anchors AS (
    SELECT DISTINCT document.id, document.proposal_id, document.document_kind
    FROM public.invoice_line_items AS line
    JOIN public.project_commercial_documents AS document
      ON (
        document.document_kind IN ('design_services', 'service_addendum', 'design_build')
        AND line.metadata->>'kind' = 'design_services_retainer'
        AND document.id::text =
              NULLIF(line.metadata->>'commercialDocumentId', '')
      )
      OR (
        document.document_kind = 'furnishings_authorization'
        AND document.id::text =
              NULLIF(line.metadata->>'commercialDocumentId', '')
      )
      OR (
        document.document_kind = 'trade_scope'
        AND document.id::text =
              NULLIF(line.metadata->>'tradeScopeDocumentId', '')
      )
    WHERE line.invoice_id = p_invoice_id
  )
  SELECT count(*) INTO v_anchor_count FROM anchors;

  IF v_anchor_count <> 1 THEN
    RAISE EXCEPTION
      'issue_invoice: invoice not found or access denied'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT document.id, document.proposal_id
  INTO v_document_id, v_proposal_id
  FROM public.project_commercial_documents AS document
  JOIN public.proposals AS proposal ON proposal.id = document.proposal_id
  JOIN public.designer_clients AS author_relationship
    ON author_relationship.id = proposal.designer_client_id
  WHERE EXISTS (
      SELECT 1
      FROM public.invoice_line_items AS line
      WHERE line.invoice_id = p_invoice_id
        AND (
          (
            document.document_kind IN (
              'design_services', 'service_addendum', 'design_build'
            )
            AND line.metadata->>'kind' = 'design_services_retainer'
            AND document.id::text =
                  NULLIF(line.metadata->>'commercialDocumentId', '')
          )
          OR (
            document.document_kind = 'furnishings_authorization'
            AND document.id::text =
                  NULLIF(line.metadata->>'commercialDocumentId', '')
          )
          OR (
            document.document_kind = 'trade_scope'
            AND document.id::text =
                  NULLIF(line.metadata->>'tradeScopeDocumentId', '')
          )
        )
    )
    AND document.project_id = v_project.id
    AND (
      proposal.project_id IS NULL
      OR proposal.project_id = v_project.id
    )
    AND proposal.document_kind = document.document_kind
    AND proposal.client_id = v_project.client_id
    AND author_relationship.designer_id = proposal.designer_id
    AND author_relationship.client_id = proposal.client_id
    AND v_invoice.project_id = v_project.id
    AND v_invoice.designer_id = v_project.designer_id
    AND v_invoice.client_id = proposal.client_id
    AND v_invoice.studio_id = v_project.studio_id;

  IF FOUND THEN
    SELECT document.* INTO v_document
    FROM public.project_commercial_documents AS document
    WHERE document.id = v_document_id
      AND document.project_id = v_project.id
    FOR UPDATE;

    SELECT proposal.* INTO v_proposal
    FROM public.proposals AS proposal
    WHERE proposal.id = v_proposal_id
      AND proposal.client_id = v_project.client_id
      AND (proposal.project_id IS NULL OR proposal.project_id = v_project.id)
      AND proposal.document_kind = v_document.document_kind
    FOR UPDATE;

    PERFORM author_relationship.id
    FROM public.designer_clients AS author_relationship
    WHERE author_relationship.id = v_proposal.designer_client_id
      AND author_relationship.designer_id = v_proposal.designer_id
      AND author_relationship.client_id = v_proposal.client_id
    FOR SHARE;
  END IF;

  IF NOT FOUND
     OR v_project.status <> 'active'
     OR NOT EXISTS (
       SELECT 1
       FROM public.organizations AS studio
       JOIN public.organization_members AS lead_membership
         ON lead_membership.organization_id = studio.id
       WHERE studio.id = v_project.studio_id
         AND studio.type = 'design_studio'
         AND studio.status = 'active'
         AND lead_membership.user_id = v_project.designer_id
         AND lead_membership.status = 'active'
         AND lead_membership.role <> 'guest'
     )
     OR NOT EXISTS (
       SELECT 1
       FROM public.user_roles AS user_role
       JOIN public.roles AS role ON role.id = user_role.role_id
       WHERE user_role.user_id = v_project.designer_id
         AND role.domain = 'designer'
     )
     OR NOT (
       p_actor_id = v_proposal.client_id
       OR p_actor_id = v_project.designer_id
       OR EXISTS (
         SELECT 1
         FROM public.organization_members AS actor_membership
         WHERE actor_membership.organization_id = v_project.studio_id
           AND actor_membership.user_id = p_actor_id
           AND actor_membership.status = 'active'
           AND actor_membership.role <> 'guest'
       )
     )
  THEN
    RAISE EXCEPTION
      'issue_invoice: invoice not found or access denied'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.project_time_entries AS time_entry
    WHERE time_entry.invoice_id = p_invoice_id
      AND time_entry.billing_state <> 'authorized'
  ) THEN
    RAISE EXCEPTION
      'issue_invoice: linked time includes entries pending authorization or nonbillable'
      USING ERRCODE = 'check_violation';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.project_time_entries AS time_entry
    JOIN public.project_billing_authorities AS authority
      ON authority.id = time_entry.billing_authority_id
    WHERE time_entry.invoice_id = p_invoice_id
      AND authority.retainer_activation_policy = 'retainer_paid'
      AND NOT EXISTS (
        SELECT 1
        FROM public.invoices AS retainer
        WHERE retainer.id = authority.retainer_invoice_id
          AND retainer.status = 'paid'
          AND retainer.amount_paid_cents >= retainer.total_cents
      )
  ) THEN
    RAISE EXCEPTION
      'issue_invoice: signed retainer invoice must be paid first'
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_invoice.status <> 'draft' THEN
    RAISE EXCEPTION
      'issue_invoice: invoice % is %, expected draft',
      p_invoice_id, v_invoice.status;
  END IF;

  SELECT count(*) INTO v_line_count
  FROM public.invoice_line_items
  WHERE invoice_id = p_invoice_id;
  IF v_line_count = 0 THEN
    RAISE EXCEPTION
      'issue_invoice: invoice % has no line items', p_invoice_id;
  END IF;

  PERFORM 1
  FROM public.invoice_line_items AS line
  JOIN public.project_payment_milestones AS milestone
    ON milestone.id = line.milestone_id
  WHERE line.invoice_id = p_invoice_id
    AND (
      milestone.status = 'paid'
      OR EXISTS (
        SELECT 1
        FROM public.invoice_line_items AS other_line
        JOIN public.invoices AS other_invoice
          ON other_invoice.id = other_line.invoice_id
        WHERE other_line.milestone_id = line.milestone_id
          AND other_line.invoice_id <> p_invoice_id
          AND other_invoice.status IN (
            'draft', 'sent', 'partially_paid', 'paid'
          )
      )
    );
  IF FOUND THEN
    RAISE EXCEPTION
      'issue_invoice: a linked milestone is already paid or billed on another invoice';
  END IF;

  v_studio_id := v_project.studio_id;
  IF v_studio_id IS NOT NULL THEN
    INSERT INTO public.studio_invoice_counters(studio_id)
    VALUES (v_studio_id)
    ON CONFLICT (studio_id)
      DO UPDATE
      SET next_number = public.studio_invoice_counters.next_number + 1
    RETURNING next_number INTO v_number;
  ELSE
    INSERT INTO public.invoice_counters(designer_id)
    VALUES (v_invoice.designer_id)
    ON CONFLICT (designer_id)
      DO UPDATE
      SET next_number = public.invoice_counters.next_number + 1
    RETURNING next_number INTO v_number;
  END IF;

  SELECT COALESCE(sum(amount_cents), 0) INTO v_subtotal
  FROM public.invoice_line_items
  WHERE invoice_id = p_invoice_id;
  v_tax := round(v_subtotal * v_invoice.tax_rate)::integer;
  v_due := COALESCE(
    p_due_date, current_date + v_invoice.payment_terms_days
  );

  UPDATE public.invoices
  SET status = 'sent',
      invoice_number = 'INV-' || lpad(v_number::text, 4, '0'),
      issue_date = current_date,
      due_date = v_due,
      subtotal_cents = v_subtotal::integer,
      tax_cents = v_tax,
      total_cents = v_subtotal::integer + v_tax,
      sent_at = now(),
      updated_at = now()
  WHERE id = p_invoice_id
  RETURNING * INTO v_invoice;

  UPDATE public.project_payment_milestones AS milestone
  SET status = 'outstanding',
      due_date = v_due,
      updated_at = now()
  FROM public.invoice_line_items AS line
  WHERE line.invoice_id = p_invoice_id
    AND line.milestone_id = milestone.id
    AND milestone.status = 'pending';

  RETURN v_invoice;
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- PART 7c — the "design-services origin" motif
-- 
-- Every function below asks one question — does this project have an
-- executed commercial origin? — by testing document_kind = 'design_services'.
-- A turnkey project originates on a design_build prime, so each must read
-- IN ('design_services', 'design_build'). Miss one and a turnkey project
-- silently has no origin: FF&E purchases, time billing, budget checkpoints,
-- the client threshold and trade scopes all refuse. Highest-risk group in
-- the wave, so SQL-T15 asserts each one separately rather than smoke-calling
-- the group.
-- 
-- The list was RE-DERIVED at branch time with the build sheet's own
-- enumerator (head-resolved bodies only) and returned exactly ten. Two
-- reconciliations against the sheet's table:
--   · create_draft_invoice is listed at 00511:3846; the enumerator
--     attributes that line to app_private.issue_invoice_for_actor, whose
--     body it is. create_draft_invoice has no origin leg of its own — not
--     grafted (F-W3-3).
--   · _create_furnishings_authorization_from_schedule_impl carries NO
--     origin motif: 00445 renamed 00423's body to
--     _create_furnishings_authorization_from_schedule_00444_impl and put a
--     readiness wrapper in its place, which 00462 then renamed to _impl.
--     The motif lives in the _00444_impl body, and that is what is grafted
--     below (F-W3-5). Grafting the sheet's named function would have
--     changed nothing and left the refusal in place.
-- ═══════════════════════════════════════════════════════════════════════════

-- Grafted VERBATIM from 00412_design_services_commercial_authority.sql:2326-2338, then the delta below.
CREATE OR REPLACE FUNCTION public._is_design_services_project(p_project_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.project_commercial_documents document
    WHERE document.project_id = p_project_id
      AND document.is_origin AND document.document_kind IN ('design_services', 'design_build')
  );
$$;

-- Grafted VERBATIM from 00575_agreement_parts.sql:2002-2223, then the delta below.
CREATE OR REPLACE FUNCTION public.classify_project_time_entry_authority()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_is_services_project boolean;
  v_authority public.project_billing_authorities%ROWTYPE;
  v_rate public.project_billing_authority_rates%ROWTYPE;
  v_prior_cents bigint;
  v_current_version integer;
  v_project_designer_id uuid;
  v_team_role text;
  v_normalized_role text;
  v_role_match_count integer := 0;
  v_current_rate_count integer := 0;
  v_retainer_ready boolean := false;
  v_is_bound boolean := false;
  v_project_ceiling_cents bigint;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.billing_authority_id IS NOT NULL AND (
    NEW.billing_authority_id IS DISTINCT FROM OLD.billing_authority_id
    OR NEW.authority_rate_id IS DISTINCT FROM OLD.authority_rate_id
    OR NEW.hourly_rate_cents IS DISTINCT FROM OLD.hourly_rate_cents
  ) THEN
    RAISE EXCEPTION 'time-entry authority and rate provenance are immutable'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Browser-supplied rate/authority ids are never selection authority. New
  -- rows and previously-unclassified rows are resolved exclusively from the
  -- signed project authority and server-owned team role below.
  IF TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND OLD.authority_rate_id IS NULL) THEN
    NEW.billing_authority_id := NULL;
    NEW.authority_rate_id := NULL;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.project_commercial_documents d
    WHERE d.project_id = NEW.project_id AND d.is_origin
      AND d.document_kind IN ('design_services', 'design_build')
  ) INTO v_is_services_project;

  IF NOT NEW.billable THEN
    NEW.billing_state := 'nonbillable';
    NEW.rated_amount_cents := CASE WHEN NEW.duration_minutes IS NULL THEN NULL ELSE 0 END;
    RETURN NEW;
  END IF;
  IF NOT v_is_services_project THEN
    NEW.billing_state := 'authorized';
    IF NEW.duration_minutes IS NOT NULL AND NEW.hourly_rate_cents IS NOT NULL THEN
      NEW.rated_amount_cents := round(NEW.duration_minutes / 60.0 * NEW.hourly_rate_cents)::integer;
    END IF;
    RETURN NEW;
  END IF;

  -- Every commercial classifier takes the same stable project lock used by an
  -- addendum countersign. It serializes project-wide accrued-ceiling reads even
  -- when the entry binds a superseded authority while another entry binds the
  -- active replacement authority.
  SELECT project.designer_id INTO v_project_designer_id
  FROM public.projects project
  WHERE project.id = NEW.project_id
  FOR UPDATE;

  SELECT authority.billing_ceiling_cents INTO v_project_ceiling_cents
  FROM public.project_billing_authorities authority
  WHERE authority.project_id = NEW.project_id AND authority.status = 'active'
  ORDER BY authority.effective_at DESC, authority.id DESC
  LIMIT 1;

  IF TG_OP = 'UPDATE' AND OLD.billing_authority_id IS NOT NULL THEN
    v_is_bound := true;
    SELECT * INTO v_authority FROM public.project_billing_authorities
    WHERE id = OLD.billing_authority_id AND project_id = NEW.project_id
    FOR UPDATE;
    SELECT * INTO v_rate FROM public.project_billing_authority_rates
    WHERE id = OLD.authority_rate_id
      AND billing_authority_id = OLD.billing_authority_id;
    IF v_authority.id IS NULL OR v_rate.id IS NULL THEN
      RAISE EXCEPTION 'bound commercial time entry has invalid authority provenance'
        USING ERRCODE = 'check_violation';
    END IF;
    NEW.billing_authority_id := OLD.billing_authority_id;
    NEW.authority_rate_id := OLD.authority_rate_id;
    NEW.hourly_rate_cents := OLD.hourly_rate_cents;
  ELSE
    SELECT * INTO v_authority FROM public.project_billing_authorities
    WHERE project_id = NEW.project_id
      AND effective_at <= NEW.started_at
      AND (ended_at IS NULL OR ended_at > NEW.started_at)
    ORDER BY effective_at DESC, id DESC LIMIT 1
    FOR UPDATE;
  END IF;
  IF v_authority.id IS NULL THEN
    NEW.billing_authority_id := NULL;
    NEW.authority_rate_id := NULL;
    NEW.billing_state := 'pending_authorization';
    NEW.rated_amount_cents := NULL;
    RETURN NEW;
  END IF;

  IF NOT v_is_bound THEN
    SELECT max(rate.version) INTO v_current_version
    FROM public.project_billing_authority_rates rate
    JOIN public.proposal_service_rates source ON source.id = rate.source_rate_id
    WHERE rate.billing_authority_id = v_authority.id
      AND source.effective_at <= NEW.started_at;

    IF v_project_designer_id IS NOT DISTINCT FROM NEW.user_id THEN
      v_team_role := 'lead_designer';
    ELSE
      SELECT CASE WHEN count(DISTINCT member.role) = 1 THEN min(member.role) END
      INTO v_team_role
      FROM public.project_team_members member
      WHERE member.project_id = NEW.project_id
        AND member.user_id = NEW.user_id
        AND member.removed_at IS NULL;
    END IF;
    v_normalized_role := regexp_replace(
      replace(lower(btrim(COALESCE(v_team_role, ''))), '_', ' '),
      '\s+', ' ', 'g'
    );

    IF v_current_version IS NOT NULL AND v_normalized_role <> '' THEN
      SELECT count(*) INTO v_role_match_count
      FROM public.project_billing_authority_rates rate
      JOIN public.proposal_service_rates source ON source.id = rate.source_rate_id
      WHERE rate.billing_authority_id = v_authority.id
        AND rate.version = v_current_version
        AND source.effective_at <= NEW.started_at
        AND regexp_replace(
          replace(lower(btrim(rate.role_name)), '_', ' '), '\s+', ' ', 'g'
        ) = v_normalized_role;
      IF v_role_match_count = 1 THEN
        SELECT rate.* INTO v_rate
        FROM public.project_billing_authority_rates rate
        JOIN public.proposal_service_rates source ON source.id = rate.source_rate_id
        WHERE rate.billing_authority_id = v_authority.id
          AND rate.version = v_current_version
          AND source.effective_at <= NEW.started_at
          AND regexp_replace(
            replace(lower(btrim(rate.role_name)), '_', ' '), '\s+', ' ', 'g'
          ) = v_normalized_role;
      END IF;
    END IF;

    IF v_rate.id IS NULL AND v_current_version IS NOT NULL THEN
      SELECT count(*) INTO v_current_rate_count
      FROM public.project_billing_authority_rates rate
      JOIN public.proposal_service_rates source ON source.id = rate.source_rate_id
      WHERE rate.billing_authority_id = v_authority.id
        AND rate.version = v_current_version
        AND source.effective_at <= NEW.started_at;
      IF v_current_rate_count = 1 THEN
        SELECT rate.* INTO v_rate
        FROM public.project_billing_authority_rates rate
        JOIN public.proposal_service_rates source ON source.id = rate.source_rate_id
        WHERE rate.billing_authority_id = v_authority.id
          AND rate.version = v_current_version
          AND source.effective_at <= NEW.started_at;
      END IF;
    END IF;
  END IF;

  IF v_rate.id IS NULL THEN
    NEW.billing_authority_id := NULL;
    NEW.authority_rate_id := NULL;
    NEW.hourly_rate_cents := NULL;
    NEW.rated_amount_cents := NULL;
    NEW.billing_state := 'pending_authorization';
    RETURN NEW;
  END IF;
  IF NOT v_is_bound THEN
    NEW.billing_authority_id := v_authority.id;
    NEW.authority_rate_id := v_rate.id;
    NEW.hourly_rate_cents := v_rate.hourly_rate_cents;
  END IF;

  v_retainer_ready := v_authority.retainer_activation_policy = 'immediate'
    OR v_authority.retainer_amount_cents = 0
    OR EXISTS (
      SELECT 1 FROM public.invoices invoice
      WHERE invoice.id = v_authority.retainer_invoice_id
        AND invoice.status = 'paid'
        AND invoice.amount_paid_cents >= invoice.total_cents
    );

  IF NEW.duration_minutes IS NULL THEN
    NEW.rated_amount_cents := NULL;
    NEW.billing_state := CASE WHEN v_retainer_ready
      THEN 'authorized' ELSE 'pending_authorization' END;
    RETURN NEW;
  END IF;
  NEW.rated_amount_cents := round(
    NEW.duration_minutes / 60.0 * CASE WHEN v_is_bound
      THEN OLD.hourly_rate_cents ELSE v_rate.hourly_rate_cents END
  )::integer;
  IF NOT v_retainer_ready THEN
    NEW.billing_state := 'pending_authorization';
    RETURN NEW;
  END IF;
  SELECT COALESCE(sum(t.rated_amount_cents), 0) INTO v_prior_cents
  FROM public.project_time_entries t
  WHERE t.project_id = NEW.project_id
    AND t.billing_state = 'authorized'
    AND t.billable AND t.duration_minutes IS NOT NULL
    AND t.id IS DISTINCT FROM NEW.id;
  -- 00575 (F-2): the ONE delta from 00412:2607-2613. billing_ceiling_cents is
  -- nullable now and NULL means uncapped, so the comparison has to answer
  -- "authorized" instead of evaluating to NULL and falling to the ELSE.
  IF COALESCE(v_project_ceiling_cents, v_authority.billing_ceiling_cents) IS NULL
     OR v_prior_cents + NEW.rated_amount_cents
        <= COALESCE(v_project_ceiling_cents, v_authority.billing_ceiling_cents) THEN
    NEW.billing_state := 'authorized';
  ELSE
    NEW.billing_state := 'pending_authorization';
  END IF;
  RETURN NEW;
END;
$$;

-- Grafted VERBATIM from 00423_trade_scope_instrument.sql:655-746, then the delta below.
CREATE OR REPLACE FUNCTION public.guard_project_ffe_purchase_authority()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_document public.project_commercial_documents%ROWTYPE;
  v_snapshot public.furnishing_authorization_items%ROWTYPE;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD.source_commercial_document_id IS NOT NULL AND (
      NEW.source_commercial_document_id IS DISTINCT FROM OLD.source_commercial_document_id
      OR NEW.source_authorization_item_id IS DISTINCT FROM OLD.source_authorization_item_id
    ) THEN
      RAISE EXCEPTION 'furnishing authorization provenance is immutable'
        USING ERRCODE = 'check_violation';
    END IF;
    -- 00423 (a)
    IF OLD.trade_scope_document_id IS NOT NULL
       AND NEW.trade_scope_document_id IS DISTINCT FROM OLD.trade_scope_document_id
    THEN
      RAISE EXCEPTION 'trade scope provenance is immutable'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  -- 00423 (b) — evaluated on INSERT and UPDATE alike, before any early return.
  IF NEW.trade_scope_document_id IS NOT NULL AND NEW.purchase_order_id IS NOT NULL THEN
    RAISE EXCEPTION 'trade scope lines are not purchase-orderable'
      USING ERRCODE = 'check_violation';
  END IF;
  IF TG_OP = 'UPDATE'
     AND NEW.purchase_order_id IS NOT DISTINCT FROM OLD.purchase_order_id THEN
    RETURN NEW;
  END IF;
  IF NEW.purchase_order_id IS NULL THEN
    RETURN NEW;
  END IF;
  -- Legacy-origin projects retain the existing 00186 behavior.
  IF NOT EXISTS (
    SELECT 1 FROM public.project_commercial_documents d
    WHERE d.project_id = NEW.project_id AND d.is_origin
      AND d.document_kind IN ('design_services', 'design_build')
  ) THEN RETURN NEW; END IF;

  SELECT * INTO v_document FROM public.project_commercial_documents
  WHERE id = NEW.source_commercial_document_id
    AND project_id = NEW.project_id
    AND document_kind = 'furnishings_authorization';
  SELECT * INTO v_snapshot FROM public.furnishing_authorization_items
  WHERE id = NEW.source_authorization_item_id
    AND commercial_document_id = v_document.id;
  IF v_document.id IS NULL OR v_snapshot.id IS NULL
     OR v_document.executed_at IS NULL
     OR NOT EXISTS (
       SELECT 1 FROM public.proposals p WHERE p.id = v_document.proposal_id
         AND p.commercial_state = 'executed'
     )
  THEN
    RAISE EXCEPTION 'FF&E item is not covered by an executed furnishing authorization'
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_snapshot.item_type = 'allowance' THEN
    IF NEW.quantity IS DISTINCT FROM v_snapshot.quantity THEN
      RAISE EXCEPTION 'FF&E quantity or client price differs from its signed snapshot'
        USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.line_total_cents IS NULL
       OR NEW.line_total_cents > v_snapshot.client_line_total_cents
       OR NEW.line_total_cents IS DISTINCT FROM
          (NEW.quantity * COALESCE(NEW.unit_price_cents, -1))
    THEN
      RAISE EXCEPTION 'FF&E allowance resolves above its signed ceiling or is internally inconsistent'
        USING ERRCODE = 'check_violation';
    END IF;
  ELSIF NEW.quantity IS DISTINCT FROM v_snapshot.quantity
     OR NEW.unit_price_cents IS DISTINCT FROM v_snapshot.client_unit_price_cents
     OR NEW.line_total_cents IS DISTINCT FROM v_snapshot.client_line_total_cents
  THEN
    RAISE EXCEPTION 'FF&E quantity or client price differs from its signed snapshot'
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_document.deposit_invoice_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.invoices i WHERE i.id = v_document.deposit_invoice_id
      AND i.status = 'paid' AND i.amount_paid_cents >= i.total_cents
  ) THEN
    RAISE EXCEPTION 'furnishings deposit invoice must be paid before purchase ordering'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

-- F-W3-5. This body was authored in 00423 as
-- create_furnishings_authorization_from_schedule and RENAMED by
-- 00445:83-85 to _create_furnishings_authorization_from_schedule_00444_impl,
-- which is the name it still answers to. It is re-headed under that
-- name here; the two wrappers above it (00445's readiness gate,
-- renamed to _..._impl by 00462, and 00462's GUC wrapper) are
-- untouched.
-- Grafted VERBATIM from 00423_trade_scope_instrument.sql:897-1188, then the delta below.
CREATE OR REPLACE FUNCTION public._create_furnishings_authorization_from_schedule_00444_impl(
  p_project_id uuid,
  p_name text,
  p_ffe_item_ids uuid[],
  p_deposit_percent numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_project public.projects%ROWTYPE;
  v_origin public.proposals%ROWTYPE;
  v_checkpoint public.project_budget_checkpoints%ROWTYPE;
  v_proposal_id uuid := extensions.gen_random_uuid();
  v_document_id uuid;
  v_name text := btrim(COALESCE(p_name, ''));
  v_ids uuid[];
  v_line public.project_ffe_items%ROWTYPE;
  v_id uuid;
  v_room_name text;
  v_price bigint;
  v_subtotal bigint := 0;
  v_deposit numeric;
  v_uncovered text;
BEGIN
  -- (1) Shape.
  IF v_actor IS NULL OR char_length(v_name) < 2 THEN
    RAISE EXCEPTION 'furnishings release requires an authenticated author and a name'
      USING ERRCODE = 'check_violation';
  END IF;
  IF p_ffe_item_ids IS NULL OR array_position(p_ffe_item_ids, NULL) IS NOT NULL THEN
    RAISE EXCEPTION 'furnishings release requires a non-null list of schedule lines'
      USING ERRCODE = 'check_violation';
  END IF;
  SELECT COALESCE(array_agg(DISTINCT s), '{}'::uuid[]) INTO v_ids
  FROM unnest(p_ffe_item_ids) AS s;
  IF array_length(v_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'furnishings release requires at least one schedule line'
      USING ERRCODE = 'check_violation';
  END IF;
  IF p_deposit_percent IS NOT NULL
     AND (p_deposit_percent < 0 OR p_deposit_percent > 100) THEN
    RAISE EXCEPTION 'furnishings deposit percent must be between 0 and 100'
      USING ERRCODE = 'check_violation';
  END IF;

  -- (2) Project + authoring authority.
  SELECT * INTO v_project FROM public.projects WHERE id = p_project_id FOR SHARE;
  IF NOT FOUND OR NOT public._can_author_proposal(v_project.designer_id) THEN
    RAISE EXCEPTION 'project % not found or access denied', p_project_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- (3) Executed design-services origin (00412 shape, byte-for-byte).
  IF NOT EXISTS (
    SELECT 1 FROM public.project_commercial_documents d
    JOIN public.proposals p ON p.id = d.proposal_id
    WHERE d.project_id = p_project_id AND d.is_origin
      AND d.document_kind IN ('design_services', 'design_build') AND p.commercial_state = 'executed'
  ) THEN
    RAISE EXCEPTION 'project % has no executed design-services origin', p_project_id
      USING ERRCODE = 'check_violation';
  END IF;

  -- (4) The latest checkpoint must be settled AND still describe its version.
  -- Verifying the fingerprint here (not only at execution) fails the studio
  -- early, while the instrument is still cheap to abandon.
  SELECT checkpoint.* INTO v_checkpoint
  FROM public.project_budget_checkpoints checkpoint
  JOIN public.project_budget_versions version
    ON version.id = checkpoint.budget_version_id
  WHERE checkpoint.project_id = p_project_id
  ORDER BY version.version DESC, checkpoint.published_at DESC, checkpoint.id DESC
  LIMIT 1 FOR SHARE OF checkpoint;
  IF v_checkpoint.id IS NULL
     OR v_checkpoint.status NOT IN ('acknowledged', 'overridden') THEN
    RAISE EXCEPTION 'latest furnishings checkpoint must be acknowledged or audited override'
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_checkpoint.snapshot_fingerprint IS DISTINCT FROM
     public._budget_version_fingerprint(v_checkpoint.budget_version_id) THEN
    RAISE EXCEPTION 'budget checkpoint no longer matches its published version'
      USING ERRCODE = 'check_violation';
  END IF;

  -- (5) Every named schedule line, locked and proven releasable.
  PERFORM 1 FROM public.project_ffe_items
  WHERE id = ANY (v_ids) ORDER BY id FOR UPDATE;

  FOREACH v_id IN ARRAY v_ids
  LOOP
    SELECT * INTO v_line FROM public.project_ffe_items WHERE id = v_id;
    IF NOT FOUND OR v_line.project_id IS DISTINCT FROM p_project_id THEN
      RAISE EXCEPTION 'schedule line % does not belong to project %', v_id, p_project_id
        USING ERRCODE = 'check_violation';
    END IF;
    -- 00423: a trade presence line is not furniture. It is priced on its own
    -- scope and billed by that scope's draws, so releasing it here would put the
    -- same money on two instruments — and the single-provenance CHECK would only
    -- say so at the client's signature. Refuse it while it is still the studio's
    -- problem, by name, the way the purchase-order sibling does.
    IF v_line.trade_scope_document_id IS NOT NULL THEN
      RAISE EXCEPTION 'schedule line "%" is trade work on its own scope and cannot be released as furnishings',
        v_line.name
        USING ERRCODE = 'check_violation';
    END IF;
    IF v_line.item_type = 'tbd' THEN
      RAISE EXCEPTION 'schedule line % is still TBD; resolve it before releasing', v_id
        USING ERRCODE = 'check_violation';
    END IF;
    -- The allowance snapshot divides the ceiling by quantity, and quantity has
    -- no CHECK on project_ffe_items. A zero would raise a bare 22012 out of the
    -- release; a negative would sign a negative unit price into the snapshot.
    IF COALESCE(v_line.quantity, 0) <= 0 THEN
      RAISE EXCEPTION 'schedule line % has no quantity to authorize', v_id
        USING ERRCODE = 'check_violation';
    END IF;
    IF v_line.item_type = 'fixed' THEN
      IF COALESCE(v_line.unit_price_cents, 0) <= 0 OR v_line.line_total_cents IS NULL THEN
        RAISE EXCEPTION 'fixed schedule line % has no client price to authorize', v_id
          USING ERRCODE = 'check_violation';
      END IF;
    ELSIF v_line.item_type = 'allowance' THEN
      IF COALESCE(v_line.budget_max_cents, 0) <= 0 THEN
        RAISE EXCEPTION 'allowance schedule line % has no ceiling to authorize', v_id
          USING ERRCODE = 'check_violation';
      END IF;
    ELSE
      RAISE EXCEPTION 'schedule line % has unsupported item type %', v_id, v_line.item_type
        USING ERRCODE = 'check_violation';
    END IF;
    -- A roomless line cannot be proven against a room-keyed budget, and the
    -- client's read has nowhere to file it. Distinct message on purpose: the
    -- studio's fix is to file the line, not to change the budget.
    IF v_line.project_room_id IS NULL THEN
      RAISE EXCEPTION 'schedule line % has no room; file it in a room before releasing', v_id
        USING ERRCODE = 'check_violation';
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.furnishing_authorization_items a
      JOIN public.project_commercial_documents d ON d.id = a.commercial_document_id
      JOIN public.proposals p ON p.id = d.proposal_id
      WHERE a.source_ffe_item_id = v_id
        AND COALESCE(p.commercial_state, 'draft') NOT IN ('declined', 'superseded')
    ) THEN
      RAISE EXCEPTION 'schedule line % is already named by a live authorization', v_id
        USING ERRCODE = 'check_violation';
    END IF;
    IF v_line.source_commercial_document_id IS NOT NULL THEN
      RAISE EXCEPTION 'schedule line % is already bound to an executed authorization', v_id
        USING ERRCODE = 'check_violation';
    END IF;

    v_subtotal := v_subtotal + CASE
      WHEN v_line.item_type = 'fixed' THEN v_line.line_total_cents
      ELSE v_line.budget_max_cents END;
  END LOOP;

  -- (6) R6 COVERAGE, HARD. Every room in the release must be a room the client
  -- saw a budget for. There is deliberately NO drift check here: whether the
  -- schedule has outgrown its target is a conversation, not a constraint. That
  -- the room was never budgeted at all is a defect.
  SELECT r.name INTO v_uncovered
  FROM public.project_ffe_items i
  JOIN public.project_rooms r ON r.id = i.project_room_id
  WHERE i.id = ANY (v_ids)
    AND NOT EXISTS (
      SELECT 1 FROM public.project_budget_lines l
      WHERE l.budget_version_id = v_checkpoint.budget_version_id
        AND l.project_room_id = i.project_room_id
    )
  ORDER BY r.name
  LIMIT 1;
  IF v_uncovered IS NOT NULL THEN
    RAISE EXCEPTION 'room "%" is not covered by the acknowledged budget', v_uncovered
      USING ERRCODE = 'check_violation';
  END IF;

  -- (7) Deposit: explicit argument, else the signed agreement's standing term,
  -- else the house default.
  -- LEFT JOIN, not JOIN: an inner join drops an authority with no terms row
  -- BEFORE the ORDER BY/LIMIT, so the answer would silently come from an older
  -- authority instead of the newest one. The newest active authority decides,
  -- and if it names no term the house default does.
  v_deposit := COALESCE(
    p_deposit_percent,
    (SELECT t.furnishings_deposit_percent
     FROM public.project_billing_authorities ba
     LEFT JOIN public.proposal_service_terms t ON t.proposal_id = ba.source_proposal_id
     WHERE ba.project_id = p_project_id AND ba.status = 'active'
     ORDER BY ba.effective_at DESC
     LIMIT 1),
    50
  );

  -- (8) The client-facing edition. Identities come from the executed origin
  -- (00412:1941-1956 shape) — there is no source draft to inherit them from.
  -- NOTE: no proposal_items clone. The schedule IS the line population.
  SELECT origin_proposal.* INTO v_origin
  FROM public.project_commercial_documents origin
  JOIN public.proposals origin_proposal ON origin_proposal.id = origin.proposal_id
  WHERE origin.project_id = p_project_id AND origin.is_origin
    AND origin.document_kind IN ('design_services', 'design_build')
    AND origin_proposal.commercial_state = 'executed'
  LIMIT 1;

  INSERT INTO public.proposals (
    id, designer_id, client_id, designer_client_id, title, description,
    subtotal, discount_amount, discount_percent, tax_rate, tax_amount,
    total_amount, deposit_percent, status, version, project_address,
    client_visibility_tier, feedback_enabled, document_kind, commercial_state
  ) VALUES (
    v_proposal_id, v_project.designer_id, v_project.client_id,
    v_origin.designer_client_id, v_name,
    'Furnishings released from the project schedule.',
    public._cents_to_int4(v_subtotal, 'this release'), 0, 0, 0, 0,
    public._cents_to_int4(v_subtotal, 'this release'), v_deposit, 'draft', 1,
    v_origin.project_address, 'full', v_origin.feedback_enabled,
    'furnishings_authorization', 'draft'
  );

  -- (9) Bind it to the project and the checkpoint it was proven against.
  INSERT INTO public.project_commercial_documents (
    project_id, proposal_id, document_kind, wave_name, budget_checkpoint_id,
    created_by
  ) VALUES (
    p_project_id, v_proposal_id, 'furnishings_authorization', v_name,
    v_checkpoint.id, v_actor
  ) RETURNING id INTO v_document_id;

  -- (10) Freeze each line. An allowance is authorized at its CEILING: the
  -- client signs for "up to this much", and the per-unit figure is that ceiling
  -- divided by quantity. Integer division truncates, so for quantity > 1 the
  -- unit price can round down by up to (quantity - 1) cents against the
  -- ceiling — deliberate: client_line_total_cents is the authoritative ceiling
  -- and the guard compares totals, never quantity × unit.
  FOREACH v_id IN ARRAY v_ids
  LOOP
    SELECT * INTO v_line FROM public.project_ffe_items WHERE id = v_id;
    SELECT r.name INTO v_room_name FROM public.project_rooms r
    WHERE r.id = v_line.project_room_id;
    v_price := CASE WHEN v_line.item_type = 'fixed'
      THEN v_line.line_total_cents ELSE v_line.budget_max_cents END;

    INSERT INTO public.furnishing_authorization_items (
      commercial_document_id, source_proposal_item_id, source_ffe_item_id,
      project_room_id, product_id, name, room_name, category, item_type,
      quantity, client_unit_price_cents, client_line_total_cents,
      trade_unit_cost_cents, markup_percent, vendor_id, vendor_name,
      snapshot, sort_order
    ) VALUES (
      v_document_id, NULL, v_line.id, v_line.project_room_id, v_line.product_id,
      v_line.name, v_room_name, COALESCE(v_line.ffe_category, 'Uncategorized'),
      v_line.item_type, v_line.quantity,
      CASE WHEN v_line.item_type = 'fixed' THEN v_line.unit_price_cents
           ELSE (v_line.budget_max_cents / v_line.quantity)::integer END,
      v_price::integer,
      v_line.trade_price_cents, v_line.markup_percent, v_line.vendor_id,
      v_line.vendor_name,
      jsonb_build_object(
        'budgetMinCents', v_line.budget_min_cents,
        'budgetMaxCents', v_line.budget_max_cents,
        'docCode', v_line.doc_code,
        'customFields', v_line.custom_fields,
        'notes', v_line.notes,
        'productImageUrl', (SELECT pr.images[1] FROM public.products pr
                            WHERE pr.id = v_line.product_id)
      ),
      v_line.sort_order
    );
  END LOOP;

  -- No GUC save/restore here on purpose: unlike the send/execute/void rails,
  -- this body sets no transaction-local capability. Every write it makes is
  -- authorized by being SECURITY DEFINER (the ledger guard's postgres check);
  -- an exception handler that restores a setting nothing set would read as
  -- load-bearing and is not.
  RETURN jsonb_build_object(
    'proposalId', v_proposal_id,
    'documentId', v_document_id,
    'projectId', p_project_id,
    'waveName', v_name,
    'commercialState', 'draft',
    'budgetCheckpointId', v_checkpoint.id,
    'itemCount', array_length(v_ids, 1),
    'documentFingerprint', public._commercial_document_fingerprint(v_proposal_id)
  );
END;
$$;

-- Grafted VERBATIM from 00423_trade_scope_instrument.sql:1284-1368, then the delta below.
CREATE OR REPLACE FUNCTION public.create_trade_scope(
  p_project_id uuid,
  p_title text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_project public.projects%ROWTYPE;
  v_origin public.proposals%ROWTYPE;
  v_title text := btrim(COALESCE(p_title, ''));
  v_proposal_id uuid := extensions.gen_random_uuid();
  v_document_id uuid;
BEGIN
  IF v_actor IS NULL OR char_length(v_title) < 2 THEN
    RAISE EXCEPTION 'a trade scope requires an authenticated author and a title'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_project FROM public.projects WHERE id = p_project_id FOR SHARE;
  IF NOT FOUND OR NOT public._can_author_proposal(v_project.designer_id) THEN
    RAISE EXCEPTION 'project % not found or access denied', p_project_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- The same origin proof the furnishings rail requires, byte-for-byte. A trade
  -- scope is an exercise of commercial authority; a project with no executed
  -- design-services agreement has none to exercise.
  IF NOT EXISTS (
    SELECT 1 FROM public.project_commercial_documents d
    JOIN public.proposals p ON p.id = d.proposal_id
    WHERE d.project_id = p_project_id AND d.is_origin
      AND d.document_kind IN ('design_services', 'design_build') AND p.commercial_state = 'executed'
  ) THEN
    RAISE EXCEPTION 'project % has no executed design-services origin', p_project_id
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT origin_proposal.* INTO v_origin
  FROM public.project_commercial_documents origin
  JOIN public.proposals origin_proposal ON origin_proposal.id = origin.proposal_id
  WHERE origin.project_id = p_project_id AND origin.is_origin
    AND origin.document_kind IN ('design_services', 'design_build')
    AND origin_proposal.commercial_state = 'executed'
  LIMIT 1;

  INSERT INTO public.proposals (
    id, designer_id, client_id, designer_client_id, title, description,
    subtotal, discount_amount, discount_percent, tax_rate, tax_amount,
    total_amount, deposit_percent, status, version, project_address,
    client_visibility_tier, feedback_enabled, document_kind, commercial_state
  ) VALUES (
    v_proposal_id, v_project.designer_id, v_project.client_id,
    v_origin.designer_client_id, v_title,
    'Trade work priced as a scope against a named party.',
    0, 0, 0, 0, 0, 0, 0, 'draft', 1,
    v_origin.project_address, 'full', v_origin.feedback_enabled,
    'trade_scope', 'draft'
  );

  -- The skeleton. Price and party arrive through the studio's editing surface
  -- and set_trade_scope_party / select_trade_bid; what matters here is that the
  -- row EXISTS, so every later read has one shape to answer with.
  INSERT INTO public.trade_scope_terms (proposal_id) VALUES (v_proposal_id);

  INSERT INTO public.project_commercial_documents (
    project_id, proposal_id, document_kind, created_by
  ) VALUES (
    p_project_id, v_proposal_id, 'trade_scope', v_actor
  ) RETURNING id INTO v_document_id;

  RETURN jsonb_build_object(
    'proposalId', v_proposal_id,
    'documentId', v_document_id,
    'projectId', p_project_id,
    'title', v_title,
    'commercialState', 'draft',
    'progressState', 'none',
    'documentFingerprint', public._commercial_document_fingerprint(v_proposal_id)
  );
END;
$$;

-- Grafted VERBATIM from 00423_trade_scope_instrument.sql:3266-3409, then the delta below.
CREATE OR REPLACE FUNCTION public.publish_budget_checkpoint(
  p_project_id uuid,
  p_version_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_version public.project_budget_versions%ROWTYPE;
  v_checkpoint public.project_budget_checkpoints%ROWTYPE;
  v_low bigint;
  v_target bigint;
  v_high bigint;
  v_stamp record;
  v_fingerprint text;
  v_previous_publish text := current_setting('app.budget_publish_id', true);
BEGIN
  SELECT v.* INTO v_version
  FROM public.project_budget_versions v
  JOIN public.projects p ON p.id = v.project_id
  WHERE v.id = p_version_id AND v.project_id = p_project_id
    AND public.is_studio_comember(p.designer_id)
  FOR UPDATE OF v;
  IF NOT FOUND OR v_actor IS NULL OR v_version.status <> 'draft' THEN
    RAISE EXCEPTION 'draft budget version % not found or access denied', p_version_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  -- 00414: a checkpoint is an act of signed commercial authority — it is what a
  -- furnishing wave is built on. A legacy project has no such authority, so it
  -- can no longer publish one.
  IF NOT EXISTS (
    SELECT 1 FROM public.project_commercial_documents d
    JOIN public.proposals p ON p.id = d.proposal_id
    WHERE d.project_id = p_project_id AND d.is_origin
      AND d.document_kind IN ('design_services', 'design_build') AND p.commercial_state = 'executed'
  ) THEN
    RAISE EXCEPTION 'project % has no executed design-services origin', p_project_id
      USING ERRCODE = 'check_violation';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.project_budget_lines l WHERE l.budget_version_id = p_version_id) THEN
    RAISE EXCEPTION 'budget version % has no lines', p_version_id
      USING ERRCODE = 'check_violation';
  END IF;

  -- 00422: freeze the coverage picture INTO the version, so the checkpoint the
  -- client acknowledges says what was scheduled and what was already authorized
  -- against each line — not just what was targeted.
  --
  -- Both rollups match on the ROOM ID wherever both sides carry one, and fall
  -- back to the name only for a legacy row that has no id (a budget line filed
  -- before 00412's project_room_id, or a proposal-sourced snapshot that never
  -- had one). Matching on name alone double-counted every pair of rooms that
  -- happened to share a name, and froze that inflated figure into the hash the
  -- client acknowledges. Written as a loop, not one UPDATE, so the narrowing to
  -- the integer columns can name which rollup overflowed.
  FOR v_stamp IN
    SELECT
      l.id AS line_id, l.room_name AS room_name, l.category AS category,
      COALESCE((
        SELECT SUM(CASE
          WHEN i.item_type = 'fixed' THEN COALESCE(i.line_total_cents, 0)
          WHEN i.item_type = 'allowance' THEN COALESCE(i.budget_max_cents, 0)
          ELSE 0 END)
        FROM public.project_ffe_items i
        LEFT JOIN public.project_rooms r ON r.id = i.project_room_id
        WHERE i.project_id = p_project_id
          -- 00423 delta: same exclusion as derive_working_budget_draft, and it
          -- is load-bearing independently. derive is not the only way a
          -- 'trade work' budget line can exist — a studio can type any category
          -- by hand, and a version derived before 00423 already carries one —
          -- so the stamp must refuse the presence lines on its own account.
          AND i.trade_scope_document_id IS NULL
          AND CASE
                WHEN l.project_room_id IS NOT NULL AND i.project_room_id IS NOT NULL
                  THEN i.project_room_id = l.project_room_id
                ELSE COALESCE(r.name, '') = l.room_name
              END
          AND COALESCE(i.ffe_category, 'Uncategorized') = l.category
      ), 0) AS scheduled,
      COALESCE((
        SELECT SUM(a.client_line_total_cents)
        FROM public.furnishing_authorization_items a
        JOIN public.project_commercial_documents d ON d.id = a.commercial_document_id
        JOIN public.proposals p ON p.id = d.proposal_id
        WHERE d.project_id = p_project_id
          AND d.executed_at IS NOT NULL
          AND p.commercial_state = 'executed'
          AND CASE
                WHEN l.project_room_id IS NOT NULL AND a.project_room_id IS NOT NULL
                  THEN a.project_room_id = l.project_room_id
                ELSE COALESCE(a.room_name, '') = l.room_name
              END
          AND COALESCE(a.category, 'Uncategorized') = l.category
      ), 0) AS authorized
    FROM public.project_budget_lines l
    WHERE l.budget_version_id = p_version_id
  LOOP
    UPDATE public.project_budget_lines SET
      scheduled_cents = public._cents_to_int4(v_stamp.scheduled,
        format('the scheduled rollup for %s · %s', v_stamp.room_name, v_stamp.category)),
      authorized_cents = public._cents_to_int4(v_stamp.authorized,
        format('the authorized rollup for %s · %s', v_stamp.room_name, v_stamp.category))
    WHERE id = v_stamp.line_id;
  END LOOP;

  SELECT sum(low_cents), sum(target_cents), sum(high_cents)
  INTO v_low, v_target, v_high
  FROM public.project_budget_lines WHERE budget_version_id = p_version_id;

  PERFORM set_config('app.budget_publish_id', p_version_id::text, true);
  UPDATE public.project_budget_versions SET
    low_total_cents = public._cents_to_int4(v_low, 'this budget version''s low total'),
    target_total_cents = public._cents_to_int4(v_target, 'this budget version''s target total'),
    high_total_cents = public._cents_to_int4(v_high, 'this budget version''s high total'),
    status = 'published', published_at = now()
  WHERE id = p_version_id RETURNING * INTO v_version;
  v_fingerprint := public._budget_version_fingerprint(p_version_id);

  INSERT INTO public.project_budget_checkpoints (
    project_id, budget_version_id, checkpoint_code, snapshot_fingerprint,
    published_by, published_at
  ) VALUES (
    p_project_id, p_version_id, 'B-' || lpad(v_version.version::text, 3, '0'),
    v_fingerprint, v_actor, v_version.published_at
  ) RETURNING * INTO v_checkpoint;
  PERFORM set_config('app.budget_publish_id', COALESCE(v_previous_publish, ''), true);

  RETURN jsonb_build_object(
    'checkpointId', v_checkpoint.id,
    'projectId', p_project_id,
    'versionId', p_version_id,
    'checkpointCode', v_checkpoint.checkpoint_code,
    'status', v_checkpoint.status,
    'snapshotFingerprint', v_checkpoint.snapshot_fingerprint,
    'publishedAt', v_checkpoint.published_at
  );
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('app.budget_publish_id', COALESCE(v_previous_publish, ''), true);
  RAISE;
END;
$$;

-- Grafted VERBATIM from 00565_the_client_page.sql:447-614, then the delta below.
CREATE OR REPLACE FUNCTION public.get_client_project_threshold(p_project_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_project public.projects%ROWTYPE;
BEGIN
  -- 00441's preamble, verbatim.
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO v_project FROM public.projects WHERE id = p_project_id;
  IF NOT FOUND OR NOT (
    v_project.client_id = v_actor
    OR public.is_studio_comember(v_project.designer_id)
  ) THEN
    RAISE EXCEPTION 'project not found or not accessible'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN jsonb_build_object(
    'projectId', v_project.id,
    'projectName', v_project.name,
    -- 00423's origin test: the project stands on a signed design-services
    -- instrument, or it is a legacy project the commercial rail never touched.
    'origin', CASE WHEN EXISTS (
      SELECT 1 FROM public.project_commercial_documents AS doc
      WHERE doc.project_id = p_project_id
        AND doc.is_origin
        AND doc.document_kind IN ('design_services', 'design_build')
    ) THEN 'commercial' ELSE 'legacy' END,

    -- ── furnishings: the FROZEN authorization snapshot the client signed ──
    -- Money comes from furnishing_authorization_items.client_* — the columns
    -- the client put her name to — never from the live working row.
    'selections', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', item.id,
        'kind', 'furnishings',
        'threadId', item.selection_thread_id,
        'name', item.name,
        'category', item.ffe_category,
        'assignmentScope', item.assignment_scope,
        'roomId', item.project_room_id,
        'roomName', COALESCE(room.name, authorization_item.room_name),
        'quantity', authorization_item.quantity,
        'clientUnitPriceCents', authorization_item.client_unit_price_cents,
        'clientLineTotalCents', authorization_item.client_line_total_cents,
        'itemType', item.item_type,
        'logisticsStatus', item.status,
        'updatedAt', GREATEST(item.updated_at, item.last_status_change_at, doc.executed_at),
        'tradeJourney', NULL,
        -- The block exists because the CLIENT signed an allowance — that is the
        -- frozen snapshot's business (authorization_item.item_type), and it
        -- never changes.
        --
        -- 00423 resolved it off the LIVE schedule line (item.item_type = 'fixed'
        -- → item.line_total_cents). That is the one path on which the restored
        -- payload would still have handed the client an unsigned working-row
        -- figure the studio can move under her, and it is withdrawn here: an
        -- allowance is RESOLVED when a later EXECUTED authorization snapshots the
        -- same live line as 'fixed', and the resolved figure is that snapshot's
        -- own client_line_total_cents. Until such an instrument exists the
        -- allowance is unresolved and this is null.
        'allowance', CASE WHEN authorization_item.item_type = 'allowance' THEN jsonb_build_object(
          'ceilingCents', authorization_item.client_line_total_cents,
          'resolvedCents', (
            SELECT resolution.client_line_total_cents
            FROM public.furnishing_authorization_items AS resolution
            JOIN public.project_commercial_documents AS resolution_doc
              ON resolution_doc.id = resolution.commercial_document_id
             AND resolution_doc.executed_at IS NOT NULL
            JOIN public.proposals AS resolution_proposal
              ON resolution_proposal.id = resolution_doc.proposal_id
             AND resolution_proposal.commercial_state = 'executed'
            WHERE resolution.source_ffe_item_id = item.id
              AND resolution.item_type = 'fixed'
            ORDER BY resolution_doc.executed_at DESC, resolution.id
            LIMIT 1
          )
        ) ELSE NULL END,
        'instrument', jsonb_build_object(
          'documentId', doc.id,
          'proposalId', proposal.id,
          'name', doc.wave_name,
          'executedAt', doc.executed_at
        ),
        'productId', item.product_id,
        'imageUrl', product.images[1],
        'docCode', item.doc_code
      ) ORDER BY room.sort_order NULLS FIRST, item.sort_order, item.created_at, item.id)
      FROM public.project_ffe_items AS item
      JOIN public.furnishing_authorization_items AS authorization_item
        ON authorization_item.id = item.source_authorization_item_id
      JOIN public.project_commercial_documents AS doc
        ON doc.id = authorization_item.commercial_document_id
       AND doc.executed_at IS NOT NULL
      JOIN public.proposals AS proposal
        ON proposal.id = doc.proposal_id
       AND proposal.commercial_state = 'executed'
      LEFT JOIN public.project_rooms AS room ON room.id = item.project_room_id
      LEFT JOIN public.products AS product ON product.id = item.product_id
      WHERE item.project_id = p_project_id
        AND item.removed_at IS NULL
        AND item.design_disposition NOT IN ('not_selected', 'superseded')
    ), '[]'::jsonb)

    -- ── trade: the presence line under an executed trade scope ────────────
    -- clientLineTotalCents reads the live row on purpose: 00423's
    -- guard_trade_presence_line_lock freezes exactly that money once the scope
    -- is executed, which is why this branch has no snapshot table of its own.
    || COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', item.id,
        'kind', 'trade',
        'threadId', item.selection_thread_id,
        'name', item.name,
        'category', item.ffe_category,
        'assignmentScope', item.assignment_scope,
        'roomId', item.project_room_id,
        'roomName', COALESCE(room.name, section.room_name),
        'quantity', item.quantity,
        'clientUnitPriceCents', NULL,
        'clientLineTotalCents', item.line_total_cents,
        'itemType', item.item_type,
        'logisticsStatus', item.status,
        'updatedAt', GREATEST(item.updated_at, item.last_status_change_at, doc.executed_at),
        'tradeJourney', terms.progress_state,
        'allowance', NULL,
        'instrument', jsonb_build_object(
          'documentId', doc.id,
          'proposalId', proposal.id,
          'name', proposal.title,
          'executedAt', doc.executed_at
        ),
        'productId', item.product_id,
        'imageUrl', product.images[1],
        'docCode', item.doc_code
      ) ORDER BY room.sort_order NULLS FIRST, item.sort_order, item.created_at, item.id)
      FROM public.project_ffe_items AS item
      JOIN public.project_commercial_documents AS doc
        ON doc.id = item.trade_scope_document_id
       AND doc.executed_at IS NOT NULL
      JOIN public.proposals AS proposal
        ON proposal.id = doc.proposal_id
       AND proposal.commercial_state = 'executed'
      JOIN public.trade_scope_terms AS terms ON terms.proposal_id = proposal.id
      LEFT JOIN public.project_rooms AS room ON room.id = item.project_room_id
      LEFT JOIN public.products AS product ON product.id = item.product_id
      LEFT JOIN LATERAL (
        SELECT scope_section.room_name
        FROM public.trade_scope_sections AS scope_section
        WHERE scope_section.proposal_id = proposal.id
          AND scope_section.project_room_id IS NOT DISTINCT FROM item.project_room_id
        ORDER BY scope_section.sort_order, scope_section.id
        LIMIT 1
      ) AS section ON true
      WHERE item.project_id = p_project_id
        AND item.removed_at IS NULL
        AND item.design_disposition NOT IN ('not_selected', 'superseded')
    ), '[]'::jsonb)
  );
END;
$$;

-- Grafted VERBATIM from 00511_public_sd_hardening.sql:5372-5773, then the delta below.
CREATE OR REPLACE FUNCTION public._execute_furnishings_authorization_authorized(
  p_proposal_id uuid,
  p_signed_name text,
  p_client_id uuid,
  p_trusted_signed_ip text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_actor uuid := p_client_id;
  v_proposal public.proposals%ROWTYPE;
  v_document public.project_commercial_documents%ROWTYPE;
  v_project public.projects%ROWTYPE;
  v_signature public.commercial_document_signatures%ROWTYPE;
  v_name text := btrim(COALESCE(p_signed_name, ''));
  v_fingerprint text;
  v_deposit_cents integer;
  v_deposit_invoice_id uuid;
  v_applied_ids uuid[] := '{}'::uuid[];
  v_linked_ids uuid[] := '{}'::uuid[];
  v_newly boolean := false;
  v_previous_accept text :=
    current_setting('app.proposal_accept_id', true);
  v_previous_commercial text :=
    current_setting('app.commercial_document_id', true);
  v_anchor_phase_id uuid;
  -- plpgsql forbids a row variable in a multi-item INTO list, so the paired
  -- composites land in one record and are unpacked below.
  v_row_5356 record;
BEGIN
  IF v_actor IS NULL OR char_length(v_name) < 2 THEN
    RAISE EXCEPTION
      'furnishings execution requires an authenticated client and legal name'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_proposal
  FROM public.proposals
  WHERE id = p_proposal_id
    AND client_id = v_actor
    AND document_kind = 'furnishings_authorization';
  IF NOT FOUND THEN
    RAISE EXCEPTION
      'furnishings authorization % not found or access denied', p_proposal_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT document, project INTO v_row_5356
  FROM public.project_commercial_documents AS document
  JOIN public.projects AS project ON project.id = document.project_id
  WHERE document.proposal_id = p_proposal_id
    AND document.document_kind = 'furnishings_authorization'
    AND project.client_id = v_actor
    AND project.status = 'active'
    AND (
      v_proposal.project_id IS NULL
      OR v_proposal.project_id = project.id
    );
  IF NOT FOUND THEN
    RAISE EXCEPTION
      'furnishings authorization % not found or access denied', p_proposal_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  v_document := v_row_5356.document;
  v_project := v_row_5356.project;

  SELECT project.* INTO v_project
  FROM public.projects AS project
  WHERE project.id = v_document.project_id
    AND project.client_id = v_actor
    AND project.designer_id = v_project.designer_id
    AND project.studio_id = v_project.studio_id
    AND project.status = 'active'
  FOR UPDATE;

  PERFORM role.id
  FROM public.roles AS role
  WHERE role.domain = 'designer'
  ORDER BY role.id
  FOR SHARE;

  PERFORM user_role.id
  FROM public.user_roles AS user_role
  JOIN public.roles AS role ON role.id = user_role.role_id
  WHERE user_role.user_id = v_project.designer_id
    AND role.domain = 'designer'
  ORDER BY user_role.role_id, user_role.id
  FOR SHARE OF user_role;
  IF NOT FOUND THEN
    RAISE EXCEPTION
      'furnishings authorization % not found or access denied', p_proposal_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  PERFORM lead_membership.id
  FROM public.organization_members AS lead_membership
  WHERE lead_membership.organization_id = v_project.studio_id
    AND lead_membership.user_id = v_project.designer_id
  ORDER BY lead_membership.id
  FOR SHARE;

  PERFORM studio.id
  FROM public.organizations AS studio
  WHERE studio.id = v_project.studio_id
  ORDER BY studio.id
  FOR SHARE;

  IF NOT EXISTS (
       SELECT 1 FROM public.organizations AS studio
       WHERE studio.id = v_project.studio_id
         AND studio.type = 'design_studio'
         AND studio.status = 'active'
     )
     OR NOT EXISTS (
       SELECT 1 FROM public.organization_members AS lead_membership
       WHERE lead_membership.organization_id = v_project.studio_id
         AND lead_membership.user_id = v_project.designer_id
         AND lead_membership.status = 'active'
         AND lead_membership.role <> 'guest'
     )
  THEN
    RAISE EXCEPTION
      'furnishings authorization % not found or access denied', p_proposal_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT proposal.* INTO v_proposal
  FROM public.proposals AS proposal
  WHERE proposal.id = p_proposal_id
    AND proposal.client_id = v_actor
    AND proposal.document_kind = 'furnishings_authorization'
    AND (proposal.project_id IS NULL OR proposal.project_id = v_project.id)
  FOR UPDATE;

  SELECT document.* INTO v_document
  FROM public.project_commercial_documents AS document
  WHERE document.id = v_document.id
    AND document.proposal_id = v_proposal.id
    AND document.project_id = v_project.id
    AND document.document_kind = 'furnishings_authorization'
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION
      'furnishings authorization % not found or access denied', p_proposal_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_proposal.commercial_state <> 'executed'
     AND v_proposal.valid_until IS NOT NULL
     AND v_proposal.valid_until < now()
  THEN
    RAISE EXCEPTION 'furnishings authorization % has expired', p_proposal_id
      USING ERRCODE = 'check_violation';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.project_budget_checkpoints AS checkpoint
    WHERE checkpoint.id = v_document.budget_checkpoint_id
      AND checkpoint.project_id = v_document.project_id
      AND checkpoint.status IN ('acknowledged', 'overridden')
      AND checkpoint.snapshot_fingerprint =
            public._budget_version_fingerprint(checkpoint.budget_version_id)
  ) THEN
    RAISE EXCEPTION
      'furnishings authorization checkpoint is missing or invalid'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.project_commercial_documents AS origin_document
    JOIN public.proposals AS origin_proposal
      ON origin_proposal.id = origin_document.proposal_id
    WHERE origin_document.project_id = v_document.project_id
      AND origin_document.is_origin
      AND origin_document.document_kind IN ('design_services', 'design_build')
      AND origin_proposal.commercial_state = 'executed'
  ) THEN
    RAISE EXCEPTION 'project % has no executed design-services origin',
      v_document.project_id
      USING ERRCODE = 'check_violation';
  END IF;

  v_fingerprint := public._commercial_document_fingerprint(p_proposal_id);
  v_deposit_cents := round(
    COALESCE(v_proposal.total_amount, 0)::numeric
    * COALESCE(v_proposal.deposit_percent, 0)::numeric / 100
  )::integer;

  SELECT * INTO v_signature
  FROM public.commercial_document_signatures
  WHERE proposal_id = p_proposal_id
    AND party_role = 'client'
  FOR UPDATE;

  IF v_proposal.commercial_state = 'executed' THEN
    IF v_signature.id IS NULL
       OR v_signature.signer_user_id IS DISTINCT FROM v_actor
       OR v_signature.signed_name IS DISTINCT FROM v_name
       OR v_signature.evidence_fingerprint IS DISTINCT FROM v_fingerprint
    THEN
      RAISE EXCEPTION
        'furnishings signature retry conflicts with immutable evidence'
        USING ERRCODE = 'check_violation';
    END IF;

    SELECT COALESCE(array_agg(item.id ORDER BY item.id), '{}'::uuid[])
    INTO v_applied_ids
    FROM public.project_ffe_items AS item
    WHERE item.source_commercial_document_id = v_document.id;
  ELSIF v_proposal.commercial_state = 'sent' THEN
    IF v_signature.id IS NOT NULL THEN
      RAISE EXCEPTION
        'furnishings signature topology conflicts with document state'
        USING ERRCODE = 'check_violation';
    END IF;

    INSERT INTO public.commercial_document_signatures (
      proposal_id, party_role, signer_user_id, signed_name, signed_ip,
      evidence_fingerprint, metadata
    ) VALUES (
      p_proposal_id, 'client', v_actor, v_name,
      NULLIF(btrim(COALESCE(p_trusted_signed_ip, '')), ''), v_fingerprint,
      jsonb_build_object('via', 'execute_furnishings_authorization')
    )
    RETURNING * INTO v_signature;

    PERFORM set_config('app.proposal_accept_id', p_proposal_id::text, true);
    PERFORM set_config(
      'app.commercial_document_id', p_proposal_id::text, true
    );

    UPDATE public.proposals
    SET status = 'accepted',
        commercial_state = 'executed',
        signed_at = v_signature.signed_at,
        signed_by_name = v_name,
        accepted_at = v_signature.signed_at,
        updated_at = now()
    WHERE id = p_proposal_id;

    WITH inserted AS (
      INSERT INTO public.project_ffe_items (
        project_id, source_proposal_item_id, product_id, name, ffe_category,
        item_type, status, quantity, unit_price_cents, trade_price_cents,
        markup_percent, line_total_cents, vendor_id, vendor_name, sort_order,
        source_commercial_document_id, source_authorization_item_id,
        custom_fields
      )
      SELECT
        v_document.project_id, item.source_proposal_item_id, item.product_id,
        item.name, item.category, item.item_type, 'approved', item.quantity,
        item.client_unit_price_cents, item.trade_unit_cost_cents,
        item.markup_percent, item.client_line_total_cents, item.vendor_id,
        item.vendor_name, item.sort_order, v_document.id, item.id,
        COALESCE(item.snapshot->'customFields', '{}'::jsonb)
      FROM public.furnishing_authorization_items AS item
      WHERE item.commercial_document_id = v_document.id
        AND item.source_proposal_item_id IS NOT NULL
      ORDER BY item.sort_order, item.id
      RETURNING id
    )
    SELECT COALESCE(array_agg(id ORDER BY id), '{}'::uuid[])
    INTO v_applied_ids
    FROM inserted;

    WITH linked AS (
      UPDATE public.project_ffe_items AS project_item
      SET source_commercial_document_id = v_document.id,
          source_authorization_item_id = item.id,
          status = CASE
            WHEN public.ffe_status_rank(project_item.status) <
                 public.ffe_status_rank('approved')
              THEN 'approved'
            ELSE project_item.status
          END,
          updated_at = now()
      FROM public.furnishing_authorization_items AS item
      WHERE item.commercial_document_id = v_document.id
        AND item.source_ffe_item_id IS NOT NULL
        AND project_item.id = item.source_ffe_item_id
      RETURNING project_item.id
    )
    SELECT COALESCE(array_agg(id ORDER BY id), '{}'::uuid[])
    INTO v_linked_ids
    FROM linked;

    SELECT COALESCE(array_agg(applied ORDER BY applied), '{}'::uuid[])
    INTO v_applied_ids
    FROM unnest(v_applied_ids || v_linked_ids) AS applied;

    IF v_deposit_cents > 0 THEN
      INSERT INTO public.invoices (
        project_id, designer_id, client_id, status, currency,
        subtotal_cents, tax_rate, tax_cents, total_cents, memo
      ) VALUES (
        v_document.project_id, v_project.designer_id, v_proposal.client_id,
        'draft', 'USD', v_deposit_cents, 0, 0, v_deposit_cents,
        'Furnishings deposit · ' || v_document.wave_name
      )
      RETURNING id INTO v_deposit_invoice_id;

      INSERT INTO public.invoice_line_items (
        invoice_id, kind, description, quantity, unit_amount_cents,
        amount_cents, metadata
      ) VALUES (
        v_deposit_invoice_id, 'adhoc',
        'Furnishings authorization deposit', 1,
        v_deposit_cents, v_deposit_cents,
        jsonb_build_object(
          'commercialDocumentId', v_document.id,
          'kind', 'furnishings_deposit'
        )
      );

      PERFORM app_private.issue_invoice_for_actor(
        v_deposit_invoice_id, current_date, v_actor
      );
    END IF;

    UPDATE public.project_commercial_documents
    SET executed_at = v_signature.signed_at,
        deposit_invoice_id = v_deposit_invoice_id
    WHERE id = v_document.id;

    v_anchor_phase_id := public._schedule_thread_phase(v_document.project_id);
    IF v_anchor_phase_id IS NOT NULL THEN
      PERFORM public._commit_schedule_edit_authorized(
        v_document.project_id,
        jsonb_build_array(jsonb_build_object(
          'kind', 'phase-anchor',
          'phase_id', v_anchor_phase_id,
          'anchor_date', to_char(v_signature.signed_at::date, 'YYYY-MM-DD'),
          'source_ref', p_proposal_id
        )),
        'Furnishings authorization executed',
        NULL,
        'ceremony:furnishings-authorization-executed'
      );
    END IF;

    PERFORM set_config(
      'app.proposal_accept_id', COALESCE(v_previous_accept, ''), true
    );
    PERFORM set_config(
      'app.commercial_document_id', COALESCE(v_previous_commercial, ''), true
    );
    v_newly := true;
  ELSE
    RAISE EXCEPTION 'furnishings authorization % is not executable from %',
      p_proposal_id, COALESCE(v_proposal.commercial_state, 'NULL')
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN jsonb_build_object(
    'projectId', v_document.project_id,
    'documentId', v_document.id,
    'checkpointId', v_document.budget_checkpoint_id,
    'appliedItemIds', to_jsonb(v_applied_ids),
    'depositInvoiceId',
      COALESCE(v_deposit_invoice_id, v_document.deposit_invoice_id),
    'depositRequiredCents', COALESCE((
      SELECT invoice.total_cents
      FROM public.invoices AS invoice
      WHERE invoice.id =
            COALESCE(v_deposit_invoice_id, v_document.deposit_invoice_id)
    ), v_deposit_cents),
    'deposit_required_cents', COALESCE((
      SELECT invoice.total_cents
      FROM public.invoices AS invoice
      WHERE invoice.id =
            COALESCE(v_deposit_invoice_id, v_document.deposit_invoice_id)
    ), v_deposit_cents),
    'depositPaidCents', COALESCE((
      SELECT invoice.amount_paid_cents
      FROM public.invoices AS invoice
      WHERE invoice.id =
            COALESCE(v_deposit_invoice_id, v_document.deposit_invoice_id)
    ), 0),
    'deposit_paid_cents', COALESCE((
      SELECT invoice.amount_paid_cents
      FROM public.invoices AS invoice
      WHERE invoice.id =
            COALESCE(v_deposit_invoice_id, v_document.deposit_invoice_id)
    ), 0),
    'newlyExecuted', v_newly
  );
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config(
    'app.proposal_accept_id', COALESCE(v_previous_accept, ''), true
  );
  PERFORM set_config(
    'app.commercial_document_id', COALESCE(v_previous_commercial, ''), true
  );
  RAISE;
END;
$$;

-- Grafted VERBATIM from 00511_public_sd_hardening.sql:5787-6118, then the delta below.
CREATE OR REPLACE FUNCTION public._execute_trade_scope_authorized(
  p_proposal_id uuid,
  p_signed_name text,
  p_client_id uuid,
  p_trusted_signed_ip text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_actor uuid := p_client_id;
  v_proposal public.proposals%ROWTYPE;
  v_document public.project_commercial_documents%ROWTYPE;
  v_project public.projects%ROWTYPE;
  v_signature public.commercial_document_signatures%ROWTYPE;
  v_terms public.trade_scope_terms%ROWTYPE;
  v_draw public.trade_scope_draws%ROWTYPE;
  v_name text := btrim(COALESCE(p_signed_name, ''));
  v_fingerprint text;
  v_deposit_invoice_id uuid;
  v_newly boolean := false;
  v_previous_accept text :=
    current_setting('app.proposal_accept_id', true);
  v_previous_commercial text :=
    current_setting('app.commercial_document_id', true);
  v_previous_draw text :=
    current_setting('app.trade_draw_invoice_id', true);
  -- plpgsql forbids a row variable in a multi-item INTO list, so the paired
  -- composites land in one record and are unpacked below.
  v_row_5764 record;
BEGIN
  IF v_actor IS NULL OR char_length(v_name) < 2 THEN
    RAISE EXCEPTION
      'trade scope execution requires an authenticated client and legal name'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_proposal
  FROM public.proposals
  WHERE id = p_proposal_id
    AND client_id = v_actor
    AND document_kind = 'trade_scope';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'trade scope % not found or access denied', p_proposal_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT document, project INTO v_row_5764
  FROM public.project_commercial_documents AS document
  JOIN public.projects AS project ON project.id = document.project_id
  WHERE document.proposal_id = p_proposal_id
    AND document.document_kind = 'trade_scope'
    AND project.client_id = v_actor
    AND project.status = 'active'
    AND (
      v_proposal.project_id IS NULL
      OR v_proposal.project_id = project.id
    );
  IF NOT FOUND THEN
    RAISE EXCEPTION 'trade scope % not found or access denied', p_proposal_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  v_document := v_row_5764.document;
  v_project := v_row_5764.project;

  SELECT project.* INTO v_project
  FROM public.projects AS project
  WHERE project.id = v_document.project_id
    AND project.client_id = v_actor
    AND project.designer_id = v_project.designer_id
    AND project.studio_id = v_project.studio_id
    AND project.status = 'active'
  FOR UPDATE;

  PERFORM role.id
  FROM public.roles AS role
  WHERE role.domain = 'designer'
  ORDER BY role.id
  FOR SHARE;

  PERFORM user_role.id
  FROM public.user_roles AS user_role
  JOIN public.roles AS role ON role.id = user_role.role_id
  WHERE user_role.user_id = v_project.designer_id
    AND role.domain = 'designer'
  ORDER BY user_role.role_id, user_role.id
  FOR SHARE OF user_role;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'trade scope % not found or access denied', p_proposal_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  PERFORM lead_membership.id
  FROM public.organization_members AS lead_membership
  WHERE lead_membership.organization_id = v_project.studio_id
    AND lead_membership.user_id = v_project.designer_id
  ORDER BY lead_membership.id
  FOR SHARE;

  PERFORM studio.id
  FROM public.organizations AS studio
  WHERE studio.id = v_project.studio_id
  ORDER BY studio.id
  FOR SHARE;

  IF NOT EXISTS (
       SELECT 1 FROM public.organizations AS studio
       WHERE studio.id = v_project.studio_id
         AND studio.type = 'design_studio'
         AND studio.status = 'active'
     )
     OR NOT EXISTS (
       SELECT 1 FROM public.organization_members AS lead_membership
       WHERE lead_membership.organization_id = v_project.studio_id
         AND lead_membership.user_id = v_project.designer_id
         AND lead_membership.status = 'active'
         AND lead_membership.role <> 'guest'
     )
  THEN
    RAISE EXCEPTION 'trade scope % not found or access denied', p_proposal_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT proposal.* INTO v_proposal
  FROM public.proposals AS proposal
  WHERE proposal.id = p_proposal_id
    AND proposal.client_id = v_actor
    AND proposal.document_kind = 'trade_scope'
    AND (proposal.project_id IS NULL OR proposal.project_id = v_project.id)
  FOR UPDATE;

  SELECT document.* INTO v_document
  FROM public.project_commercial_documents AS document
  WHERE document.id = v_document.id
    AND document.proposal_id = v_proposal.id
    AND document.project_id = v_project.id
    AND document.document_kind = 'trade_scope'
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'trade scope % not found or access denied', p_proposal_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_proposal.commercial_state <> 'executed'
     AND v_proposal.valid_until IS NOT NULL
     AND v_proposal.valid_until < now()
  THEN
    RAISE EXCEPTION 'trade scope % has expired', p_proposal_id
      USING ERRCODE = 'check_violation';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.project_commercial_documents AS origin_document
    JOIN public.proposals AS origin_proposal
      ON origin_proposal.id = origin_document.proposal_id
    WHERE origin_document.project_id = v_document.project_id
      AND origin_document.is_origin
      AND origin_document.document_kind IN ('design_services', 'design_build')
      AND origin_proposal.commercial_state = 'executed'
  ) THEN
    RAISE EXCEPTION 'project % has no executed design-services origin',
      v_document.project_id
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_terms
  FROM public.trade_scope_terms
  WHERE proposal_id = p_proposal_id;
  v_fingerprint := public._commercial_document_fingerprint(p_proposal_id);

  SELECT * INTO v_signature
  FROM public.commercial_document_signatures
  WHERE proposal_id = p_proposal_id
    AND party_role = 'client'
  FOR UPDATE;

  IF v_proposal.commercial_state = 'executed' THEN
    IF v_signature.id IS NULL
       OR v_signature.signer_user_id IS DISTINCT FROM v_actor
       OR v_signature.signed_name IS DISTINCT FROM v_name
       OR v_signature.evidence_fingerprint IS DISTINCT FROM v_fingerprint
    THEN
      RAISE EXCEPTION
        'trade scope signature retry conflicts with immutable evidence'
        USING ERRCODE = 'check_violation';
    END IF;
  ELSIF v_proposal.commercial_state = 'sent' THEN
    IF v_signature.id IS NOT NULL THEN
      RAISE EXCEPTION 'trade scope signature topology conflicts with document state'
        USING ERRCODE = 'check_violation';
    END IF;

    SELECT * INTO v_draw
    FROM public.trade_scope_draws
    WHERE proposal_id = p_proposal_id
    ORDER BY sort_order, id
    LIMIT 1
    FOR UPDATE;
    IF v_draw.id IS NULL THEN
      RAISE EXCEPTION 'trade scope has no draw schedule to bill'
        USING ERRCODE = 'check_violation';
    END IF;
    IF v_draw.gates_on_acceptance THEN
      RAISE EXCEPTION
        'the trade scope deposit draw gates on acceptance and cannot be billed at signature'
        USING ERRCODE = 'check_violation';
    END IF;

    INSERT INTO public.commercial_document_signatures (
      proposal_id, party_role, signer_user_id, signed_name, signed_ip,
      evidence_fingerprint, metadata
    ) VALUES (
      p_proposal_id, 'client', v_actor, v_name,
      NULLIF(btrim(COALESCE(p_trusted_signed_ip, '')), ''), v_fingerprint,
      jsonb_build_object('via', 'execute_trade_scope')
    )
    RETURNING * INTO v_signature;

    PERFORM set_config('app.proposal_accept_id', p_proposal_id::text, true);
    PERFORM set_config(
      'app.commercial_document_id', p_proposal_id::text, true
    );
    UPDATE public.proposals
    SET status = 'accepted',
        commercial_state = 'executed',
        signed_at = v_signature.signed_at,
        signed_by_name = v_name,
        accepted_at = v_signature.signed_at,
        updated_at = now()
    WHERE id = p_proposal_id;

    INSERT INTO public.invoices (
      project_id, designer_id, client_id, status, currency,
      subtotal_cents, tax_rate, tax_cents, total_cents, memo
    ) VALUES (
      v_document.project_id, v_project.designer_id, v_proposal.client_id,
      'draft', COALESCE(v_terms.currency, 'USD'),
      v_draw.amount_cents, 0, 0, v_draw.amount_cents,
      'Trade scope deposit · ' || v_draw.label
    )
    RETURNING id INTO v_deposit_invoice_id;

    INSERT INTO public.invoice_line_items (
      invoice_id, kind, description, quantity, unit_amount_cents,
      amount_cents, metadata
    ) VALUES (
      v_deposit_invoice_id, 'adhoc', v_draw.label, 1,
      v_draw.amount_cents, v_draw.amount_cents,
      jsonb_build_object(
        'tradeScopeId', p_proposal_id,
        'tradeScopeDocumentId', v_document.id,
        'drawId', v_draw.id,
        'kind', 'trade_draw'
      )
    );

    PERFORM app_private.issue_invoice_for_actor(
      v_deposit_invoice_id, current_date, v_actor
    );

    UPDATE public.project_commercial_documents
    SET executed_at = v_signature.signed_at,
        deposit_invoice_id = v_deposit_invoice_id
    WHERE id = v_document.id;

    PERFORM set_config('app.trade_draw_invoice_id', v_draw.id::text, true);
    UPDATE public.trade_scope_draws
    SET invoice_id = v_deposit_invoice_id
    WHERE id = v_draw.id;
    PERFORM set_config(
      'app.trade_draw_invoice_id', COALESCE(v_previous_draw, ''), true
    );

    PERFORM public._close_trade_rfqs_for_scope(p_proposal_id);

    PERFORM set_config(
      'app.proposal_accept_id', COALESCE(v_previous_accept, ''), true
    );
    PERFORM set_config(
      'app.commercial_document_id', COALESCE(v_previous_commercial, ''), true
    );
    v_newly := true;
  ELSE
    RAISE EXCEPTION 'trade scope % is not executable from %',
      p_proposal_id, COALESCE(v_proposal.commercial_state, 'NULL')
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_document
  FROM public.project_commercial_documents
  WHERE id = v_document.id;

  RETURN jsonb_build_object(
    'proposalId', p_proposal_id,
    'projectId', v_document.project_id,
    'documentId', v_document.id,
    'commercialState', 'executed',
    'progressState', COALESCE((
      SELECT terms.progress_state
      FROM public.trade_scope_terms AS terms
      WHERE terms.proposal_id = p_proposal_id
    ), 'none'),
    'depositInvoiceId', v_document.deposit_invoice_id,
    'depositRequiredCents', (
      SELECT invoice.total_cents
      FROM public.invoices AS invoice
      WHERE invoice.id = v_document.deposit_invoice_id
    ),
    'depositPaidCents', COALESCE((
      SELECT invoice.amount_paid_cents
      FROM public.invoices AS invoice
      WHERE invoice.id = v_document.deposit_invoice_id
    ), 0),
    'newlyExecuted', v_newly
  );
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config(
    'app.proposal_accept_id', COALESCE(v_previous_accept, ''), true
  );
  PERFORM set_config(
    'app.commercial_document_id', COALESCE(v_previous_commercial, ''), true
  );
  PERFORM set_config(
    'app.trade_draw_invoice_id', COALESCE(v_previous_draw, ''), true
  );
  RAISE;
END;
$$;

-- Grafted VERBATIM from 00511_public_sd_hardening.sql:4639-5025, then the delta below.
CREATE OR REPLACE FUNCTION public._execute_furnishings_authorization_on_paper_authorized(
  p_proposal_id uuid,
  p_signed_name text,
  p_paper_signed_on date,
  p_recorded_by uuid,
  p_scan_document_id uuid DEFAULT NULL,
  p_disclosed_impact jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  -- 00425 DELTA 1 (actor). v_actor is the SIGNER everywhere below, and the
  -- signer is still the client — they are the one who signed, on paper. It is
  -- resolved from the row rather than passed in, because the caller is the
  -- studio. v_recorder is who is doing the recording.
  v_actor uuid;
  v_recorder uuid := p_recorded_by;
  v_proposal public.proposals%ROWTYPE;
  v_document public.project_commercial_documents%ROWTYPE;
  v_project public.projects%ROWTYPE;
  v_signature public.commercial_document_signatures%ROWTYPE;
  v_name text := btrim(COALESCE(p_signed_name, ''));
  v_fingerprint text;
  v_deposit_cents integer;
  v_deposit_invoice_id uuid;
  v_applied_ids uuid[] := '{}'::uuid[];
  v_linked_ids uuid[] := '{}'::uuid[];
  v_newly boolean := false;
  v_previous_accept text := current_setting('app.proposal_accept_id', true);
  v_previous_commercial text := current_setting('app.commercial_document_id', true);
  v_anchor_phase_id uuid;   -- 00475
  -- plpgsql forbids a row variable in a multi-item INTO list, so the paired
  -- composites land in one record and are unpacked below.
  v_row_4630 record;
BEGIN
  IF v_recorder IS NULL OR char_length(v_name) < 2 THEN
    RAISE EXCEPTION 'recording a paper furnishings execution requires an authenticated studio author and legal name'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT proposal, document, project
  INTO v_row_4630
  FROM public.proposals AS proposal
  JOIN public.project_commercial_documents AS document
    ON document.proposal_id = proposal.id
   AND document.document_kind = 'furnishings_authorization'
  JOIN public.projects AS project ON project.id = document.project_id
  JOIN public.designer_clients AS relationship
    ON relationship.id = proposal.designer_client_id
  JOIN public.organizations AS studio ON studio.id = project.studio_id
  JOIN public.organization_members AS recorder_membership
    ON recorder_membership.organization_id = project.studio_id
   AND recorder_membership.user_id = v_recorder
  JOIN public.organization_members AS lead_membership
    ON lead_membership.organization_id = project.studio_id
   AND lead_membership.user_id = project.designer_id
  WHERE proposal.id = p_proposal_id
    AND proposal.client_id IS NOT NULL
    AND proposal.document_kind = 'furnishings_authorization'
    AND (proposal.project_id IS NULL OR proposal.project_id = project.id)
    AND relationship.designer_id = proposal.designer_id
    AND relationship.client_id = proposal.client_id
    AND project.client_id = proposal.client_id
    AND project.status = 'active'
    AND studio.type = 'design_studio'
    AND studio.status = 'active'
    AND recorder_membership.status = 'active'
    AND recorder_membership.role <> 'guest'
    AND lead_membership.status = 'active'
    AND lead_membership.role <> 'guest';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'furnishings authorization % not found or access denied', p_proposal_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  v_proposal := v_row_4630.proposal;
  v_document := v_row_4630.document;
  v_project := v_row_4630.project;

  SELECT project.* INTO v_project
  FROM public.projects AS project
  WHERE project.id = v_document.project_id
    AND project.client_id = v_proposal.client_id
    AND project.designer_id = v_project.designer_id
    AND project.studio_id = v_project.studio_id
    AND project.status = 'active'
  FOR UPDATE;

  PERFORM role.id
  FROM public.roles AS role
  WHERE role.domain = 'designer'
  ORDER BY role.id
  FOR SHARE;

  PERFORM user_role.id
  FROM public.user_roles AS user_role
  JOIN public.roles AS role ON role.id = user_role.role_id
  WHERE user_role.user_id = v_project.designer_id
    AND role.domain = 'designer'
  ORDER BY user_role.role_id, user_role.id
  FOR SHARE OF user_role;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'furnishings authorization % not found or access denied', p_proposal_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  PERFORM membership.id
  FROM public.organization_members AS membership
  WHERE membership.organization_id = v_project.studio_id
    AND membership.user_id = ANY(ARRAY[
      v_project.designer_id, v_recorder
    ]::uuid[])
  ORDER BY membership.user_id, membership.id
  FOR SHARE;

  PERFORM studio.id
  FROM public.organizations AS studio
  WHERE studio.id = v_project.studio_id
  ORDER BY studio.id
  FOR SHARE;

  IF NOT EXISTS (
       SELECT 1 FROM public.organizations AS studio
       WHERE studio.id = v_project.studio_id
         AND studio.type = 'design_studio'
         AND studio.status = 'active'
     )
     OR NOT EXISTS (
       SELECT 1 FROM public.organization_members AS membership
       WHERE membership.organization_id = v_project.studio_id
         AND membership.user_id = v_project.designer_id
         AND membership.status = 'active'
         AND membership.role <> 'guest'
     )
     OR NOT EXISTS (
       SELECT 1 FROM public.organization_members AS membership
       WHERE membership.organization_id = v_project.studio_id
         AND membership.user_id = v_recorder
         AND membership.status = 'active'
         AND membership.role <> 'guest'
     )
  THEN
    RAISE EXCEPTION 'furnishings authorization % not found or access denied', p_proposal_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT proposal.* INTO v_proposal
  FROM public.proposals AS proposal
  WHERE proposal.id = p_proposal_id
    AND proposal.document_kind = 'furnishings_authorization'
    AND proposal.client_id = v_project.client_id
    AND (proposal.project_id IS NULL OR proposal.project_id = v_project.id)
  FOR UPDATE;

  SELECT document.* INTO v_document
  FROM public.project_commercial_documents AS document
  WHERE document.id = v_document.id
    AND document.proposal_id = v_proposal.id
    AND document.project_id = v_project.id
    AND document.document_kind = 'furnishings_authorization'
  FOR UPDATE;

  PERFORM relationship.id
  FROM public.designer_clients AS relationship
  WHERE relationship.id = v_proposal.designer_client_id
    AND relationship.designer_id = v_proposal.designer_id
    AND relationship.client_id = v_proposal.client_id
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'furnishings authorization % not found or access denied', p_proposal_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  v_actor := v_proposal.client_id;
  -- 00425 DELTA 4 (expiry). The client rail refuses an expired authorization
  -- here, because in the portal the link IS the offer. The paper rail does not:
  -- the client already signed, on the date the record carries, and a lapsed
  -- link is not a reason to throw that away. record_paper_client_signature and
  -- record_offline_signature (00399) have never had this guard either.
  IF NOT EXISTS (
    SELECT 1 FROM public.project_budget_checkpoints c
    WHERE c.id = v_document.budget_checkpoint_id
      AND c.project_id = v_document.project_id
      AND c.status IN ('acknowledged', 'overridden')
      AND c.snapshot_fingerprint = public._budget_version_fingerprint(c.budget_version_id)
  ) THEN
    RAISE EXCEPTION 'furnishings authorization checkpoint is missing or invalid'
      USING ERRCODE = 'check_violation';
  END IF;
  -- 00414: defense in depth. create_furnishings_authorization proved the
  -- executed design-services origin when the wave was minted; re-assert it at
  -- the moment authority is actually exercised, so a wave in flight cannot
  -- outlive the origin that authorized it. Applies to the executed retry too:
  -- the retry path re-derives applied item ids and must not answer for a
  -- project whose origin has been unbound.
  IF NOT EXISTS (
    SELECT 1 FROM public.project_commercial_documents d
    JOIN public.proposals p ON p.id = d.proposal_id
    WHERE d.project_id = v_document.project_id AND d.is_origin
      AND d.document_kind IN ('design_services', 'design_build') AND p.commercial_state = 'executed'
  ) THEN
    RAISE EXCEPTION 'project % has no executed design-services origin', v_document.project_id
      USING ERRCODE = 'check_violation';
  END IF;
  v_fingerprint := public._commercial_document_fingerprint(p_proposal_id);
  v_deposit_cents := round(
    COALESCE(v_proposal.total_amount, 0)::numeric
    * COALESCE(v_proposal.deposit_percent, 0)::numeric / 100
  )::integer;
  SELECT * INTO v_signature FROM public.commercial_document_signatures
  WHERE proposal_id = p_proposal_id AND party_role = 'client' FOR UPDATE;

  IF v_proposal.commercial_state = 'executed' THEN
    IF v_signature.id IS NULL OR v_signature.signer_user_id IS DISTINCT FROM v_actor
       OR v_signature.signed_name IS DISTINCT FROM v_name
       OR v_signature.evidence_fingerprint IS DISTINCT FROM v_fingerprint
    THEN
      RAISE EXCEPTION 'furnishings signature retry conflicts with immutable evidence'
        USING ERRCODE = 'check_violation';
    END IF;
    SELECT COALESCE(array_agg(i.id ORDER BY i.id), '{}'::uuid[]) INTO v_applied_ids
    FROM public.project_ffe_items i
    WHERE i.source_commercial_document_id = v_document.id;
  ELSIF v_proposal.commercial_state = 'sent' THEN
    IF v_signature.id IS NOT NULL THEN
      RAISE EXCEPTION 'furnishings signature topology conflicts with document state'
        USING ERRCODE = 'check_violation';
    END IF;
    INSERT INTO public.commercial_document_signatures (
      proposal_id, party_role, signer_user_id, signed_name, signed_ip,
      evidence_fingerprint, metadata
    ) VALUES (
      p_proposal_id, 'client', v_actor, v_name,
      -- 00425 DELTA 2 (signed_ip) and DELTA 3 (metadata). No IP, because no
      -- browser: the paper tell. The metadata builder validates the paper date
      -- and the scan pointer before it returns.
      NULL, v_fingerprint,
      public._paper_signature_metadata(
        p_proposal_id, 'execute_furnishings_authorization_on_paper',
        p_paper_signed_on, v_recorder, p_scan_document_id
      )
    ) RETURNING * INTO v_signature;

    PERFORM set_config('app.proposal_accept_id', p_proposal_id::text, true);
    PERFORM set_config('app.commercial_document_id', p_proposal_id::text, true);
    -- 00414: signed_ip is NOT mirrored onto proposals. The column grant on
    -- commercial_document_signatures takes the signing IP away from studio
    -- readers; mirroring it onto public.proposals — which stays fully
    -- SELECT-granted to authenticated and row-visible to every design-studio
    -- co-member (00401 proposals_design_studio_select) — would hand the same
    -- value back one table over. The signature row is the evidence of record.
    UPDATE public.proposals SET
      status = 'accepted', commercial_state = 'executed',
      signed_at = v_signature.signed_at, signed_by_name = v_name,
      accepted_at = v_signature.signed_at, updated_at = now()
    WHERE id = p_proposal_id;

    -- (a) Legacy provenance: a proposal-sourced snapshot still MINTS its line.
    WITH inserted AS (
      INSERT INTO public.project_ffe_items (
        project_id, source_proposal_item_id, product_id, name, ffe_category,
        item_type, status, quantity, unit_price_cents, trade_price_cents,
        markup_percent, line_total_cents, vendor_id, vendor_name, sort_order,
        source_commercial_document_id, source_authorization_item_id, custom_fields
      ) SELECT
        v_document.project_id, a.source_proposal_item_id, a.product_id, a.name,
        a.category, a.item_type, 'approved', a.quantity,
        a.client_unit_price_cents, a.trade_unit_cost_cents, a.markup_percent,
        a.client_line_total_cents, a.vendor_id, a.vendor_name, a.sort_order,
        v_document.id, a.id, COALESCE(a.snapshot->'customFields', '{}'::jsonb)
      FROM public.furnishing_authorization_items a
      WHERE a.commercial_document_id = v_document.id
        AND a.source_proposal_item_id IS NOT NULL
      ORDER BY a.sort_order, a.id
      RETURNING id
    ) SELECT COALESCE(array_agg(id ORDER BY id), '{}'::uuid[]) INTO v_applied_ids
      FROM inserted;

    -- (b) 00422 provenance: a schedule-sourced snapshot LINKS the line it froze.
    -- The status ratchet uses the 00184 rank helper so a line already further
    -- along (ordered, shipped…) is never dragged back to 'approved'.
    WITH linked AS (
      UPDATE public.project_ffe_items i SET
        source_commercial_document_id = v_document.id,
        source_authorization_item_id = a.id,
        status = CASE
          WHEN public.ffe_status_rank(i.status) < public.ffe_status_rank('approved')
            THEN 'approved' ELSE i.status END,
        updated_at = now()
      FROM public.furnishing_authorization_items a
      WHERE a.commercial_document_id = v_document.id
        AND a.source_ffe_item_id IS NOT NULL
        AND i.id = a.source_ffe_item_id
      RETURNING i.id
    ) SELECT COALESCE(array_agg(id ORDER BY id), '{}'::uuid[]) INTO v_linked_ids
      FROM linked;
    -- Sorted, not concatenated: the executed-retry branch above re-derives this
    -- list with array_agg(... ORDER BY i.id), so a caller comparing a first
    -- execution against its own retry must see the same order, not two
    -- provenance groups in insertion order.
    SELECT COALESCE(array_agg(applied ORDER BY applied), '{}'::uuid[])
    INTO v_applied_ids
    FROM unnest(v_applied_ids || v_linked_ids) AS applied;

    IF v_deposit_cents > 0 THEN
      INSERT INTO public.invoices (
        project_id, designer_id, client_id, status, currency,
        subtotal_cents, tax_rate, tax_cents, total_cents, memo
      ) VALUES (
        v_document.project_id, v_project.designer_id, v_proposal.client_id,
        'draft', 'USD', v_deposit_cents, 0, 0, v_deposit_cents,
        'Furnishings deposit · ' || v_document.wave_name
      ) RETURNING id INTO v_deposit_invoice_id;
      INSERT INTO public.invoice_line_items (
        invoice_id, kind, description, quantity, unit_amount_cents,
        amount_cents, metadata
      ) VALUES (
        v_deposit_invoice_id, 'adhoc', 'Furnishings authorization deposit', 1,
        v_deposit_cents, v_deposit_cents,
        jsonb_build_object('commercialDocumentId', v_document.id, 'kind', 'furnishings_deposit')
      );
      PERFORM app_private.issue_invoice_for_actor(
        v_deposit_invoice_id, current_date, v_recorder
      );
    END IF;
    UPDATE public.project_commercial_documents SET
      executed_at = v_signature.signed_at,
      deposit_invoice_id = v_deposit_invoice_id
    WHERE id = v_document.id;

    -- 00475 (R109 ceremony class): the studio records this act, so the sheet
    -- states the impact and the anchor hardens. The date is the day the client
    -- signed the paper original, not the day it was recorded. A NULL impact
    -- still downgrades to a proposal (R110).
    v_anchor_phase_id := public._schedule_thread_phase(v_document.project_id);
    IF v_anchor_phase_id IS NOT NULL THEN
      PERFORM public._commit_schedule_edit_authorized(
        v_document.project_id,
        jsonb_build_array(jsonb_build_object(
          'kind', 'phase-anchor',
          'phase_id', v_anchor_phase_id,
          'anchor_date', to_char(
            COALESCE(p_paper_signed_on, v_signature.signed_at::date), 'YYYY-MM-DD'),
          'source_ref', p_proposal_id
        )),
        'Furnishings authorization executed',
        p_disclosed_impact,
        'ceremony:furnishings-authorization-executed'
      );
    END IF;

    PERFORM set_config('app.proposal_accept_id', COALESCE(v_previous_accept, ''), true);
    PERFORM set_config('app.commercial_document_id', COALESCE(v_previous_commercial, ''), true);
    v_newly := true;
  ELSE
    RAISE EXCEPTION 'furnishings authorization % is not executable from %',
      p_proposal_id, COALESCE(v_proposal.commercial_state, 'NULL')
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN jsonb_build_object(
    'projectId', v_document.project_id,
    'documentId', v_document.id,
    'checkpointId', v_document.budget_checkpoint_id,
    'appliedItemIds', to_jsonb(v_applied_ids),
    'depositInvoiceId', COALESCE(v_deposit_invoice_id, v_document.deposit_invoice_id),
    'depositRequiredCents', COALESCE((SELECT i.total_cents
      FROM public.invoices i
      WHERE i.id = COALESCE(v_deposit_invoice_id, v_document.deposit_invoice_id)), v_deposit_cents),
    'deposit_required_cents', COALESCE((SELECT i.total_cents
      FROM public.invoices i
      WHERE i.id = COALESCE(v_deposit_invoice_id, v_document.deposit_invoice_id)), v_deposit_cents),
    'depositPaidCents', COALESCE((SELECT i.amount_paid_cents
      FROM public.invoices i
      WHERE i.id = COALESCE(v_deposit_invoice_id, v_document.deposit_invoice_id)), 0),
    'deposit_paid_cents', COALESCE((SELECT i.amount_paid_cents
      FROM public.invoices i
      WHERE i.id = COALESCE(v_deposit_invoice_id, v_document.deposit_invoice_id)), 0),
    'newlyExecuted', v_newly
  );
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('app.proposal_accept_id', COALESCE(v_previous_accept, ''), true);
  PERFORM set_config('app.commercial_document_id', COALESCE(v_previous_commercial, ''), true);
  RAISE;
END;
$$;

-- Grafted VERBATIM from 00511_public_sd_hardening.sql:5039-5358, then the delta below.
CREATE OR REPLACE FUNCTION public._execute_trade_scope_on_paper_authorized(
  p_proposal_id uuid,
  p_signed_name text,
  p_paper_signed_on date,
  p_recorded_by uuid,
  p_scan_document_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  -- 00425 DELTA 1 (actor). v_actor is the SIGNER everywhere below, and the
  -- signer is still the client — they are the one who signed, on paper. It is
  -- resolved from the row rather than passed in, because the caller is the
  -- studio. v_recorder is who is doing the recording.
  v_actor uuid;
  v_recorder uuid := p_recorded_by;
  v_proposal public.proposals%ROWTYPE;
  v_document public.project_commercial_documents%ROWTYPE;
  v_project public.projects%ROWTYPE;
  v_signature public.commercial_document_signatures%ROWTYPE;
  v_terms public.trade_scope_terms%ROWTYPE;
  v_draw public.trade_scope_draws%ROWTYPE;
  v_name text := btrim(COALESCE(p_signed_name, ''));
  v_fingerprint text;
  v_deposit_invoice_id uuid;
  v_newly boolean := false;
  v_previous_accept text := current_setting('app.proposal_accept_id', true);
  v_previous_commercial text := current_setting('app.commercial_document_id', true);
  v_previous_draw text := current_setting('app.trade_draw_invoice_id', true);
  -- plpgsql forbids a row variable in a multi-item INTO list, so the paired
  -- composites land in one record and are unpacked below.
  v_row_5021 record;
BEGIN
  IF v_recorder IS NULL OR char_length(v_name) < 2 THEN
    RAISE EXCEPTION 'recording a paper trade scope execution requires an authenticated studio author and legal name'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT proposal, document, project
  INTO v_row_5021
  FROM public.proposals AS proposal
  JOIN public.project_commercial_documents AS document
    ON document.proposal_id = proposal.id
   AND document.document_kind = 'trade_scope'
  JOIN public.projects AS project ON project.id = document.project_id
  JOIN public.designer_clients AS relationship
    ON relationship.id = proposal.designer_client_id
  JOIN public.organizations AS studio ON studio.id = project.studio_id
  JOIN public.organization_members AS recorder_membership
    ON recorder_membership.organization_id = project.studio_id
   AND recorder_membership.user_id = v_recorder
  JOIN public.organization_members AS lead_membership
    ON lead_membership.organization_id = project.studio_id
   AND lead_membership.user_id = project.designer_id
  WHERE proposal.id = p_proposal_id
    AND proposal.client_id IS NOT NULL
    AND proposal.document_kind = 'trade_scope'
    AND (proposal.project_id IS NULL OR proposal.project_id = project.id)
    AND relationship.designer_id = proposal.designer_id
    AND relationship.client_id = proposal.client_id
    AND project.client_id = proposal.client_id
    AND project.status = 'active'
    AND studio.type = 'design_studio'
    AND studio.status = 'active'
    AND recorder_membership.status = 'active'
    AND recorder_membership.role <> 'guest'
    AND lead_membership.status = 'active'
    AND lead_membership.role <> 'guest';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'trade scope % not found or access denied', p_proposal_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  v_proposal := v_row_5021.proposal;
  v_document := v_row_5021.document;
  v_project := v_row_5021.project;

  SELECT project.* INTO v_project
  FROM public.projects AS project
  WHERE project.id = v_document.project_id
    AND project.client_id = v_proposal.client_id
    AND project.designer_id = v_project.designer_id
    AND project.studio_id = v_project.studio_id
    AND project.status = 'active'
  FOR UPDATE;

  PERFORM role.id
  FROM public.roles AS role
  WHERE role.domain = 'designer'
  ORDER BY role.id
  FOR SHARE;

  PERFORM user_role.id
  FROM public.user_roles AS user_role
  JOIN public.roles AS role ON role.id = user_role.role_id
  WHERE user_role.user_id = v_project.designer_id
    AND role.domain = 'designer'
  ORDER BY user_role.role_id, user_role.id
  FOR SHARE OF user_role;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'trade scope % not found or access denied', p_proposal_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  PERFORM membership.id
  FROM public.organization_members AS membership
  WHERE membership.organization_id = v_project.studio_id
    AND membership.user_id = ANY(ARRAY[
      v_project.designer_id, v_recorder
    ]::uuid[])
  ORDER BY membership.user_id, membership.id
  FOR SHARE;

  PERFORM studio.id
  FROM public.organizations AS studio
  WHERE studio.id = v_project.studio_id
  ORDER BY studio.id
  FOR SHARE;

  IF NOT EXISTS (
       SELECT 1 FROM public.organizations AS studio
       WHERE studio.id = v_project.studio_id
         AND studio.type = 'design_studio'
         AND studio.status = 'active'
     )
     OR NOT EXISTS (
       SELECT 1 FROM public.organization_members AS membership
       WHERE membership.organization_id = v_project.studio_id
         AND membership.user_id = v_project.designer_id
         AND membership.status = 'active'
         AND membership.role <> 'guest'
     )
     OR NOT EXISTS (
       SELECT 1 FROM public.organization_members AS membership
       WHERE membership.organization_id = v_project.studio_id
         AND membership.user_id = v_recorder
         AND membership.status = 'active'
         AND membership.role <> 'guest'
     )
  THEN
    RAISE EXCEPTION 'trade scope % not found or access denied', p_proposal_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT proposal.* INTO v_proposal
  FROM public.proposals AS proposal
  WHERE proposal.id = p_proposal_id
    AND proposal.document_kind = 'trade_scope'
    AND proposal.client_id = v_project.client_id
    AND (proposal.project_id IS NULL OR proposal.project_id = v_project.id)
  FOR UPDATE;

  SELECT document.* INTO v_document
  FROM public.project_commercial_documents AS document
  WHERE document.id = v_document.id
    AND document.proposal_id = v_proposal.id
    AND document.project_id = v_project.id
    AND document.document_kind = 'trade_scope'
  FOR UPDATE;

  PERFORM relationship.id
  FROM public.designer_clients AS relationship
  WHERE relationship.id = v_proposal.designer_client_id
    AND relationship.designer_id = v_proposal.designer_id
    AND relationship.client_id = v_proposal.client_id
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'trade scope % not found or access denied', p_proposal_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  v_actor := v_proposal.client_id;
  -- 00425 DELTA 4 (expiry). Gone, for the reason the furnishings twin states:
  -- papers are not time-boxed, and the client rail's own expiry refusal is
  -- untouched and still tested.
  -- Defense in depth, exactly as the furnishings rail does it: the origin proved
  -- at authoring must still be there when the authority is exercised.
  IF NOT EXISTS (
    SELECT 1 FROM public.project_commercial_documents d
    JOIN public.proposals p ON p.id = d.proposal_id
    WHERE d.project_id = v_document.project_id AND d.is_origin
      AND d.document_kind IN ('design_services', 'design_build') AND p.commercial_state = 'executed'
  ) THEN
    RAISE EXCEPTION 'project % has no executed design-services origin', v_document.project_id
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_terms FROM public.trade_scope_terms WHERE proposal_id = p_proposal_id;
  v_fingerprint := public._commercial_document_fingerprint(p_proposal_id);
  SELECT * INTO v_signature FROM public.commercial_document_signatures
  WHERE proposal_id = p_proposal_id AND party_role = 'client' FOR UPDATE;

  IF v_proposal.commercial_state = 'executed' THEN
    IF v_signature.id IS NULL OR v_signature.signer_user_id IS DISTINCT FROM v_actor
       OR v_signature.signed_name IS DISTINCT FROM v_name
       OR v_signature.evidence_fingerprint IS DISTINCT FROM v_fingerprint
    THEN
      RAISE EXCEPTION 'trade scope signature retry conflicts with immutable evidence'
        USING ERRCODE = 'check_violation';
    END IF;
  ELSIF v_proposal.commercial_state = 'sent' THEN
    IF v_signature.id IS NOT NULL THEN
      RAISE EXCEPTION 'trade scope signature topology conflicts with document state'
        USING ERRCODE = 'check_violation';
    END IF;
    SELECT * INTO v_draw FROM public.trade_scope_draws
    WHERE proposal_id = p_proposal_id ORDER BY sort_order, id LIMIT 1 FOR UPDATE;
    IF v_draw.id IS NULL THEN
      RAISE EXCEPTION 'trade scope has no draw schedule to bill'
        USING ERRCODE = 'check_violation';
    END IF;
    -- Belt to the send seam's braces. The send gate refuses a schedule whose
    -- first draw gates on acceptance, so this should be unreachable — but the
    -- draw about to be billed unconditionally, at signature, is the last place
    -- to notice that it says it is due on acceptance. issue_trade_draw_invoice
    -- makes the same assertion at its own seam; this rail should not be the one
    -- place a gated draw can be billed without the gate.
    IF v_draw.gates_on_acceptance THEN
      RAISE EXCEPTION 'the trade scope deposit draw gates on acceptance and cannot be billed at signature'
        USING ERRCODE = 'check_violation';
    END IF;

    INSERT INTO public.commercial_document_signatures (
      proposal_id, party_role, signer_user_id, signed_name, signed_ip,
      evidence_fingerprint, metadata
    ) VALUES (
      p_proposal_id, 'client', v_actor, v_name,
      -- 00425 DELTA 2 (signed_ip) and DELTA 3 (metadata). No IP, because no
      -- browser: the paper tell. The metadata builder validates the paper date
      -- and the scan pointer before it returns.
      NULL, v_fingerprint,
      public._paper_signature_metadata(
        p_proposal_id, 'execute_trade_scope_on_paper',
        p_paper_signed_on, v_recorder, p_scan_document_id
      )
    ) RETURNING * INTO v_signature;

    PERFORM set_config('app.proposal_accept_id', p_proposal_id::text, true);
    PERFORM set_config('app.commercial_document_id', p_proposal_id::text, true);
    UPDATE public.proposals SET
      status = 'accepted', commercial_state = 'executed',
      signed_at = v_signature.signed_at, signed_by_name = v_name,
      accepted_at = v_signature.signed_at, updated_at = now()
    WHERE id = p_proposal_id;

    -- Draw one is the deposit. It is issued unconditionally: the whole point of
    -- a draw schedule is that the first draw is what puts the trade to work.
    INSERT INTO public.invoices (
      project_id, designer_id, client_id, status, currency,
      subtotal_cents, tax_rate, tax_cents, total_cents, memo
    ) VALUES (
      v_document.project_id, v_project.designer_id, v_proposal.client_id,
      'draft', COALESCE(v_terms.currency, 'USD'),
      v_draw.amount_cents, 0, 0, v_draw.amount_cents,
      'Trade scope deposit · ' || v_draw.label
    ) RETURNING id INTO v_deposit_invoice_id;
    INSERT INTO public.invoice_line_items (
      invoice_id, kind, description, quantity, unit_amount_cents,
      amount_cents, metadata
    ) VALUES (
      v_deposit_invoice_id, 'adhoc', v_draw.label, 1,
      v_draw.amount_cents, v_draw.amount_cents,
      jsonb_build_object(
        'tradeScopeId', p_proposal_id,
        'tradeScopeDocumentId', v_document.id,
        'drawId', v_draw.id,
        'kind', 'trade_draw'
      )
    );
    PERFORM app_private.issue_invoice_for_actor(
      v_deposit_invoice_id, current_date, v_recorder
    );

    UPDATE public.project_commercial_documents SET
      executed_at = v_signature.signed_at,
      deposit_invoice_id = v_deposit_invoice_id
    WHERE id = v_document.id;

    PERFORM set_config('app.trade_draw_invoice_id', v_draw.id::text, true);
    UPDATE public.trade_scope_draws SET invoice_id = v_deposit_invoice_id
    WHERE id = v_draw.id;
    PERFORM set_config('app.trade_draw_invoice_id', COALESCE(v_previous_draw, ''), true);

    -- 00424 DELTA — the work is awarded, so the asking is over.
    PERFORM public._close_trade_rfqs_for_scope(p_proposal_id);

    PERFORM set_config('app.proposal_accept_id', COALESCE(v_previous_accept, ''), true);
    PERFORM set_config('app.commercial_document_id', COALESCE(v_previous_commercial, ''), true);
    v_newly := true;
  ELSE
    RAISE EXCEPTION 'trade scope % is not executable from %',
      p_proposal_id, COALESCE(v_proposal.commercial_state, 'NULL')
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_document FROM public.project_commercial_documents
  WHERE id = v_document.id;

  RETURN jsonb_build_object(
    'proposalId', p_proposal_id,
    'projectId', v_document.project_id,
    'documentId', v_document.id,
    'commercialState', 'executed',
    'progressState', COALESCE((SELECT t.progress_state FROM public.trade_scope_terms t
      WHERE t.proposal_id = p_proposal_id), 'none'),
    'depositInvoiceId', v_document.deposit_invoice_id,
    'depositRequiredCents', (SELECT i.total_cents FROM public.invoices i
      WHERE i.id = v_document.deposit_invoice_id),
    'depositPaidCents', COALESCE((SELECT i.amount_paid_cents FROM public.invoices i
      WHERE i.id = v_document.deposit_invoice_id), 0),
    'newlyExecuted', v_newly
  );
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('app.proposal_accept_id', COALESCE(v_previous_accept, ''), true);
  PERFORM set_config('app.commercial_document_id', COALESCE(v_previous_commercial, ''), true);
  PERFORM set_config('app.trade_draw_invoice_id', COALESCE(v_previous_draw, ''), true);
  RAISE;
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- PART 8 — upsert_agreement_parts, the turnkey dispatch
-- 
-- Five deltas on 00577's head body:
--   (a) the kind allowlist admits design_build;
--   (b) 'per_draw' is now legal in the money row, so the cadence refusal
--       stops naming it as impossible;
--   (c) the three turnkey payload validators run in the save loop — but
--       only once a payload is materially complete. R22's lesson, ruled in
--       Wave 1 and paid for in a walk, is that A DRAFT IS ALLOWED TO BE
--       UNFINISHED: a freshly materialized turnkey template carries an
--       empty basis and an empty draw list, and refusing the first Save of
--       the first sentence leaves no order of work that reaches a saved
--       draft. Send asks all four unconditionally, and parts freeze when
--       the document leaves draft (R6), so nothing half-composed can reach
--       a homeowner;
--   (d) the no-double-count rule IS asked here, unconditionally — it is not
--       incompleteness, it is a contradiction, and §4.3 asks for it at all
--       three layers;
--   (e) one part per money variant now covers the three turnkey variants,
--       because the client bundle and the send door both read them by shape;
--   (f) the cadence a turnkey agreement projects, when it carries no cadence
--       part of its own, is 'per_draw' — R9's one authority for this class.
-- ═══════════════════════════════════════════════════════════════════════════

-- Grafted VERBATIM from 00577_agreement_fee_schedules.sql:1034-1631, then the delta below.
CREATE OR REPLACE FUNCTION public.upsert_agreement_parts(
  p_proposal_id uuid,
  p_parts jsonb,
  p_why text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_proposal public.proposals%ROWTYPE;
  v_existing public.proposal_service_terms%ROWTYPE;
  v_terms jsonb;
  v_rates jsonb;
  v_version integer;
  v_duplicate text;
  v_part jsonb;
  v_payload jsonb;
  v_kind text;
  v_variant text;
  v_key text;
  v_title text;
  v_keys text[] := ARRAY[]::text[];
  v_role jsonb;
  v_role_name text;
  v_role_names text[];
  v_percent numeric;
  v_previous_commercial text := current_setting('app.commercial_document_id', true);
  v_previous_projection text := current_setting('app.agreement_projection', true);
  -- 00577
  v_before jsonb;
  v_after jsonb;
  v_fee_basis text;
  v_fee_amount_cents integer;
  v_fee_schedule jsonb;
  v_phase jsonb;
  -- 00578
  v_message text;
BEGIN
  IF auth.uid() IS NULL
     OR jsonb_typeof(COALESCE(p_parts, 'null'::jsonb)) <> 'array'
  THEN
    RAISE EXCEPTION 'agreement parts require an authenticated author and an ordered array'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_proposal FROM public.proposals
  WHERE id = p_proposal_id FOR UPDATE;
  IF NOT FOUND OR v_proposal.status <> 'draft'
     OR NOT public._can_author_proposal(v_proposal.designer_id)
  THEN
    RAISE EXCEPTION 'draft proposal % not found or access denied', p_proposal_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_proposal.document_kind NOT IN ('legacy', 'design_services', 'service_addendum', 'design_build') THEN
    RAISE EXCEPTION 'proposal % is not a design-services draft', p_proposal_id
      USING ERRCODE = 'check_violation';
  END IF;

  -- ─────────────────────────────────────────────────────────────────────────
  -- R7 (N-7) and R2 (N-6): every refusal a composition can earn is worded
  -- HERE, in the designer's words, and asked BEFORE anything is written.
  --
  -- Everything below this loop lands rows whose CHECK constraints, unique
  -- indexes and NOT NULLs would otherwise answer for us — and Postgres
  -- answers with the name of a constraint, a column or a table, which the
  -- composer prints verbatim as its save note. A designer must never read
  -- one.
  --
  -- The money halves are asked with jsonb_typeof BEFORE any cast, exactly as
  -- _agreement_floor_unmet asks them, so the floor and the projection can
  -- never read one payload two ways: a rate stated as the string "22500" is
  -- refused here rather than billing hours against a cap the floor is blind
  -- to, and a ceiling stated as a string earns its own sentence rather than
  -- the floor's.
  --
  -- Nothing here is a UI courtesy duplicated in SQL: upsert_agreement_parts
  -- is GRANTed to authenticated, so this loop is the only thing standing
  -- between a hand-made payload and the money row the authority snapshots.
  -- ─────────────────────────────────────────────────────────────────────────
  FOR v_part IN SELECT value FROM jsonb_array_elements(p_parts)
  LOOP
    IF jsonb_typeof(v_part) <> 'object' THEN
      RAISE EXCEPTION 'this agreement could not be read as a list of parts'
        USING ERRCODE = 'check_violation';
    END IF;

    v_kind    := btrim(COALESCE(v_part->>'kind', ''));
    v_variant := NULLIF(btrim(COALESCE(v_part->>'variant', '')), '');
    v_key     := btrim(COALESCE(v_part->>'partKey', ''));
    v_title   := btrim(COALESCE(v_part->>'title', ''));
    v_payload := COALESCE(v_part->'payload', '{}'::jsonb);

    IF v_kind = '' OR v_key = '' THEN
      RAISE EXCEPTION 'every part of an agreement needs a name and a type'
        USING ERRCODE = 'check_violation';
    END IF;
    IF v_title = '' THEN
      RAISE EXCEPTION 'every part of an agreement needs a title'
        USING ERRCODE = 'check_violation';
    END IF;
    IF jsonb_typeof(v_payload) <> 'object' THEN
      RAISE EXCEPTION 'the part titled "%" could not be read', v_title
        USING ERRCODE = 'check_violation';
    END IF;
    -- The uniqueness the table states as uniq_agreement_part_key, asked in
    -- the words of the rail rather than in the words of the index.
    IF v_key = ANY (v_keys) THEN
      RAISE EXCEPTION 'this agreement lists the part titled "%" twice', v_title
        USING ERRCODE = 'check_violation';
    END IF;
    v_keys := v_keys || v_key;

    -- The three fields the INSERT below casts. Postgres answers a bad cast
    -- with `invalid input syntax for type boolean` and the like, and the
    -- composer prints the RPC's text verbatim as its save note — so these are
    -- asked here, in the words of the room, exactly as every money figure is.
    IF v_part ? 'required'
       AND jsonb_typeof(v_part->'required') NOT IN ('boolean', 'null') THEN
      RAISE EXCEPTION 'whether the part titled "%" is required is a yes or a no', v_title
        USING ERRCODE = 'check_violation';
    END IF;
    IF v_part ? 'clientVisible'
       AND jsonb_typeof(v_part->'clientVisible') NOT IN ('boolean', 'null') THEN
      RAISE EXCEPTION 'whether the client sees the part titled "%" is a yes or a no', v_title
        USING ERRCODE = 'check_violation';
    END IF;
    IF NULLIF(btrim(COALESCE(v_part->>'sourcePartId', '')), '') IS NOT NULL
       AND btrim(v_part->>'sourcePartId') !~*
           '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      RAISE EXCEPTION 'the part that "%" was copied from could not be read', v_title
        USING ERRCODE = 'check_violation';
    END IF;

    IF v_kind = 'schedule' AND v_variant = 'rate_card' THEN
      IF v_payload ? 'roles' AND jsonb_typeof(v_payload->'roles') <> 'array' THEN
        RAISE EXCEPTION 'a rate card is a list of roles and their hourly rates'
          USING ERRCODE = 'check_violation';
      END IF;
      v_role_names := ARRAY[]::text[];
      FOR v_role IN
        SELECT value FROM jsonb_array_elements(
          CASE WHEN jsonb_typeof(v_payload->'roles') = 'array'
               THEN v_payload->'roles' ELSE '[]'::jsonb END)
      LOOP
        IF jsonb_typeof(v_role) <> 'object' THEN
          RAISE EXCEPTION 'a rate card is a list of roles and their hourly rates'
            USING ERRCODE = 'check_violation';
        END IF;
        v_role_name := btrim(COALESCE(v_role->>'roleName', ''));
        IF v_role_name = '' THEN
          RAISE EXCEPTION 'every role on the rate card needs a name'
            USING ERRCODE = 'check_violation';
        END IF;
        -- The rates table is unique on (proposal, version, role name), and
        -- the projection btrims the name exactly as this does.
        IF v_role_name = ANY (v_role_names) THEN
          RAISE EXCEPTION 'the rate card names % twice', v_role_name
            USING ERRCODE = 'check_violation';
        END IF;
        v_role_names := v_role_names || v_role_name;
        IF v_role->'hourlyRateCents' IS NULL
           OR jsonb_typeof(v_role->'hourlyRateCents') = 'null' THEN
          RAISE EXCEPTION 'every role on the rate card needs an hourly rate'
            USING ERRCODE = 'check_violation';
        END IF;
        PERFORM public._agreement_assert_cents(v_role, 'hourlyRateCents', 'hourly rate');
        IF v_role ? 'sortOrder'
           AND jsonb_typeof(v_role->'sortOrder') NOT IN ('number', 'null') THEN
          RAISE EXCEPTION 'the rate card''s order could not be read at %', v_role_name
            USING ERRCODE = 'check_violation';
        END IF;
        -- (B-9) A date the projection cannot read would reach
        -- proposal_service_rates as a raw cast error. Asked here instead.
        IF NULLIF(btrim(COALESCE(v_role->>'effectiveAt', '')), '') IS NOT NULL THEN
          BEGIN
            PERFORM (v_role->>'effectiveAt')::timestamptz;
          EXCEPTION WHEN OTHERS THEN
            RAISE EXCEPTION 'the date % takes effect could not be read', v_role_name
              USING ERRCODE = 'check_violation';
          END;
        END IF;
      END LOOP;
    END IF;

    IF v_kind = 'schedule' AND v_variant = 'ceiling' THEN
      PERFORM public._agreement_assert_cents(v_payload, 'cents', 'ceiling');
    END IF;

    IF v_kind = 'schedule' AND v_variant = 'retainer' THEN
      PERFORM public._agreement_assert_cents(v_payload, 'cents', 'retainer');
      IF NULLIF(btrim(COALESCE(v_payload->>'activationPolicy', '')), '') IS NOT NULL
         AND v_payload->>'activationPolicy' NOT IN ('immediate', 'retainer_paid') THEN
        RAISE EXCEPTION 'a retainer starts either right away or once it is paid'
          USING ERRCODE = 'check_violation';
      END IF;
      -- 00577: the credit rule reaches proposal_service_terms now, and its
      -- CHECK would answer a designer with the name of a constraint.
      IF NULLIF(btrim(COALESCE(v_payload->>'creditRule', '')), '') IS NOT NULL
         AND v_payload->>'creditRule'
             NOT IN ('credited', 'non_refundable', 'replenishing') THEN
        RAISE EXCEPTION 'a retainer is credited against fees, non-refundable, or replenishing'
          USING ERRCODE = 'check_violation';
      END IF;
    END IF;

    -- 00577 (P5). The two Wave-2 fee shapes, asked the way every other money
    -- figure in this loop is asked: jsonb_typeof BEFORE any cast, so a
    -- malformed payload earns a sentence rather than reaching the money row
    -- as a raw cast error.
    IF v_kind = 'schedule' AND v_variant = 'flat' THEN
      PERFORM public._agreement_assert_cents(v_payload, 'cents', 'flat fee');
    END IF;

    IF v_kind = 'schedule' AND v_variant = 'per_phase' THEN
      IF v_payload ? 'phases' AND jsonb_typeof(v_payload->'phases') <> 'array' THEN
        RAISE EXCEPTION 'a per-phase fee is a list of phases and what each one costs'
          USING ERRCODE = 'check_violation';
      END IF;
      FOR v_phase IN
        SELECT value FROM jsonb_array_elements(
          CASE WHEN jsonb_typeof(v_payload->'phases') = 'array'
               THEN v_payload->'phases' ELSE '[]'::jsonb END)
      LOOP
        IF jsonb_typeof(v_phase) <> 'object' THEN
          RAISE EXCEPTION 'a per-phase fee is a list of phases and what each one costs'
            USING ERRCODE = 'check_violation';
        END IF;
        IF btrim(COALESCE(v_phase->>'label', '')) = '' THEN
          RAISE EXCEPTION 'every phase of a per-phase fee needs a name'
            USING ERRCODE = 'check_violation';
        END IF;
        PERFORM public._agreement_assert_cents(v_phase, 'cents', 'phase fee');
      END LOOP;
    END IF;

    -- 00578: 'per_draw' is legal in the money row from this migration on
    -- (PART 2 widened both cadence CHECKs), so it joins the sentence rather
    -- than being refused by it.
    IF v_kind = 'schedule' AND v_variant = 'cadence' THEN
      IF NULLIF(btrim(COALESCE(v_payload->>'cadence', '')), '') IS NOT NULL
         AND v_payload->>'cadence'
             NOT IN ('monthly', 'biweekly', 'milestone', 'per_draw') THEN
        RAISE EXCEPTION 'billing runs monthly, every two weeks, at milestones, or on each draw'
          USING ERRCODE = 'check_violation';
      END IF;
    END IF;

    -- 00578 (P9): the three turnkey money payloads, asked ONLY once the
    -- designer has filled the shape enough to be judged. See the header note
    -- (c): an empty basis and an empty draw list are what a materialized
    -- template looks like, and Save must not refuse them.
    IF v_kind = 'schedule' AND v_variant = 'pricing_basis'
       AND NULLIF(btrim(COALESCE(v_payload->>'basis', '')), '') IS NOT NULL
       AND jsonb_typeof(v_payload->'costLines') = 'array'
       AND jsonb_array_length(v_payload->'costLines') > 0 THEN
      v_message := public._validate_pricing_basis_payload(v_payload);
      IF v_message IS NOT NULL THEN
        RAISE EXCEPTION '%', v_message USING ERRCODE = 'check_violation';
      END IF;
    END IF;

    IF v_kind = 'schedule' AND v_variant = 'draws'
       AND jsonb_typeof(v_payload->'draws') = 'array'
       AND jsonb_array_length(v_payload->'draws') > 1 THEN
      v_message := public._validate_draws_payload(v_payload);
      IF v_message IS NOT NULL THEN
        RAISE EXCEPTION '%', v_message USING ERRCODE = 'check_violation';
      END IF;
    END IF;

    IF v_kind = 'schedule' AND v_variant = 'allowances'
       AND jsonb_typeof(v_payload->'allowances') = 'array'
       AND jsonb_array_length(v_payload->'allowances') > 0 THEN
      v_message := public._validate_allowances_payload(v_payload);
      IF v_message IS NOT NULL THEN
        RAISE EXCEPTION '%', v_message USING ERRCODE = 'check_violation';
      END IF;
    END IF;

    IF v_kind = 'schedule' AND v_variant = 'procurement' THEN
      IF v_payload->'depositPercent' IS NOT NULL
         AND jsonb_typeof(v_payload->'depositPercent') <> 'null' THEN
        IF jsonb_typeof(v_payload->'depositPercent') <> 'number' THEN
          RAISE EXCEPTION 'a furnishings deposit is a percentage between 0 and 100'
            USING ERRCODE = 'check_violation';
        END IF;
        v_percent := (v_payload->'depositPercent' #>> '{}')::numeric;
        IF v_percent < 0 OR v_percent > 100 THEN
          RAISE EXCEPTION 'a furnishings deposit is a percentage between 0 and 100'
            USING ERRCODE = 'check_violation';
        END IF;
      END IF;
    END IF;
  END LOOP;

  -- 00578 (§4.3, research 02 §9 item 6). SUPERVISION IS PAID ONCE. This is
  -- not incompleteness — a half-written draft cannot accidentally state both
  -- a supervision fee and a markup on the trades — so unlike the three
  -- payload validators above it is asked at every Save, in the same sentence
  -- the composer and the send door use.
  v_message := public._validate_no_double_count(p_parts);
  IF v_message IS NOT NULL THEN
    RAISE EXCEPTION '%', v_message USING ERRCODE = 'check_violation';
  END IF;

  PERFORM set_config('app.commercial_document_id', p_proposal_id::text, true);
  UPDATE public.proposals
  SET document_kind = CASE WHEN document_kind = 'legacy' THEN 'design_services' ELSE document_kind END,
      commercial_state = 'draft', updated_at = now()
  WHERE id = p_proposal_id;

  -- 00577 (P8): the set as it stood. Captured before the write, because the
  -- write is DELETE-then-INSERT and there is no other moment it exists.
  SELECT COALESCE(jsonb_agg(to_jsonb(ap) - 'created_at' - 'updated_at' - 'proposal_id'
                            ORDER BY ap.position, ap.id), '[]'::jsonb)
  INTO v_before
  FROM public.proposal_agreement_parts ap WHERE ap.proposal_id = p_proposal_id;

  SET CONSTRAINTS uniq_agreement_part_position DEFERRED;
  DELETE FROM public.proposal_agreement_parts WHERE proposal_id = p_proposal_id;
  INSERT INTO public.proposal_agreement_parts (
    proposal_id, position, kind, variant, part_key, title, payload,
    required, client_visible, source_template_key, source_part_id
  )
  SELECT
    p_proposal_id,
    e.ord::integer,
    e.part->>'kind',
    NULLIF(e.part->>'variant', ''),
    e.part->>'partKey',
    btrim(e.part->>'title'),
    COALESCE(e.part->'payload', '{}'::jsonb),
    COALESCE((e.part->>'required')::boolean, false),
    COALESCE((e.part->>'clientVisible')::boolean, true),
    NULLIF(e.part->>'sourceTemplateKey', ''),
    NULLIF(e.part->>'sourcePartId', '')::uuid
  FROM jsonb_array_elements(p_parts) WITH ORDINALITY AS e(part, ord);

  -- One of each money part. The projection below reads a money part by its
  -- shape, so two ceilings — however they are keyed — would leave the money
  -- row picking between them. The Add menu offers every schedule variant;
  -- this is the sentence that answers "add a second ceiling", in the words a
  -- designer uses for the part rather than the words the table uses.
  SELECT CASE ap.variant
           WHEN 'rate_card'     THEN 'rate card'
           WHEN 'ceiling'       THEN 'ceiling'
           WHEN 'retainer'      THEN 'retainer'
           WHEN 'cadence'       THEN 'billing cadence'
           WHEN 'procurement'   THEN 'furnishings deposit'
           WHEN 'pricing_basis' THEN 'pricing basis'
           WHEN 'draws'         THEN 'draw schedule'
           WHEN 'allowances'    THEN 'allowances list'
         END
    INTO v_duplicate
  FROM public.proposal_agreement_parts ap
  WHERE ap.proposal_id = p_proposal_id
    AND ap.kind = 'schedule'
    AND ap.variant IN ('rate_card', 'ceiling', 'retainer', 'cadence',
                       'procurement', 'pricing_basis', 'draws', 'allowances')
  GROUP BY ap.variant
  HAVING count(*) > 1
  ORDER BY 1
  LIMIT 1;
  IF v_duplicate IS NOT NULL THEN
    RAISE EXCEPTION 'an agreement carries only one %', v_duplicate
      USING ERRCODE = 'check_violation';
  END IF;

  -- 00577 (P5, R9): ONE FEE BASIS. A flat fee and a per-phase schedule both
  -- answer "what does the work cost", and the projection below writes
  -- fee_basis from whichever is present — so two of them, in any combination,
  -- leave that column choosing between two answers. W1's refusal above cannot
  -- say this: it asks about one variant at a time, and flat-beside-per_phase
  -- is one of each.
  IF (SELECT count(*) FROM public.proposal_agreement_parts ap
      WHERE ap.proposal_id = p_proposal_id
        AND ap.kind = 'schedule'
        AND ap.client_visible
        AND ap.variant IN ('flat', 'per_phase')) > 1 THEN
    RAISE EXCEPTION 'an agreement carries one fee basis'
      USING ERRCODE = 'check_violation';
  END IF;

  -- R4'S FLOOR IS NOT ASKED HERE. A DRAFT IS ALLOWED TO BE UNFINISHED.
  --
  -- R22 places the floor at the doors a document LEAVES DRAFT by — send, sign
  -- and the paper door — and Wave 1 also asked it here, at Save. The walk
  -- showed what that costs: a freshly materialized composition seeds a rate
  -- card from the studio's defaults with no ceiling beside it and no fee typed
  -- yet, so the first Save of the first sentence the designer writes is
  -- refused, and every Save after it, until a fee AND a cap are typed. There
  -- is no order of work that reaches a saved draft. Composing an agreement is
  -- writing, and writing is saved half-done.
  --
  -- Nothing is lost by moving it: _agreement_floor_unmet and
  -- _agreement_fee_unnamed are asked at send_commercial_document,
  -- _sign_design_services_agreement_authorized and
  -- _issue_design_services_agreement_on_paper, and parts freeze when the
  -- document leaves draft (R6) — so no composition below the floor can reach
  -- a homeowner. The readiness panel names both blockers in the room the
  -- moment the rail renders, which is where the designer needs to read them.
  --
  -- The duplicate refusal above STAYS at this door: it is not a floor, it is
  -- the projection's precondition — two ceilings leave the money row picking
  -- between them, and there is no half-composed state that wants that.

  SELECT * INTO v_existing FROM public.proposal_service_terms
  WHERE proposal_id = p_proposal_id;
  v_version := COALESCE(v_existing.current_rate_version, 1);

  -- WHAT PROJECTS, AND ON WHAT GROUND.
  --
  -- The four prose columns are read from the four standard keys: 'the scope'
  -- and 'the terms' are named slots on the legacy row, and two clauses cannot
  -- both be the scope. UNIQUE (proposal_id, part_key) makes each of those a
  -- scalar, and each subquery also asserts the kind — a schedule keyed
  -- patina.services is not the scope.
  --
  -- The five money figures are read by SHAPE — kind 'schedule' plus variant —
  -- under whatever key the composition gave them, because the composer mints
  -- a fresh key for every part it adds and the figure on the page must be the
  -- figure in the money row. The duplicate refusal above makes each of these
  -- a scalar too.
  --
  -- Both halves still insist on the shape, so a clause keyed patina.ceiling
  -- is prose that happens to mention a cap and writes nothing (R5), and every
  -- variant outside these five — flat, per_phase, percent_of_cost, draws,
  -- allowances — is recorded and hashed and reaches the money row not at all,
  -- until R9's Wave-2 columns exist to hold it.
  --
  -- patina.retainer's payload->>'creditRule' is READ AND DISCARDED in Wave 1:
  -- the column arrives on proposal_service_terms in Wave 2 (D-2). It is not a
  -- dropped field, it is a field with nowhere to land yet.
  v_terms := jsonb_build_object(
    'scope', COALESCE((
      SELECT ap.payload->>'body' FROM public.proposal_agreement_parts ap
      WHERE ap.proposal_id = p_proposal_id AND ap.part_key = 'patina.services'
        AND ap.kind = 'clause'
    ), ''),
    'deliverables', COALESCE((
      SELECT jsonb_agg(e.item->>'text' ORDER BY e.ord)
             FILTER (WHERE e.item->>'text' IS NOT NULL)
      FROM public.proposal_agreement_parts ap
      CROSS JOIN LATERAL jsonb_array_elements(
        CASE WHEN jsonb_typeof(ap.payload->'items') = 'array'
             THEN ap.payload->'items' ELSE '[]'::jsonb END
      ) WITH ORDINALITY AS e(item, ord)
      WHERE ap.proposal_id = p_proposal_id AND ap.part_key = 'patina.deliverables'
        AND ap.kind = 'list'
    ), '[]'::jsonb),
    'exclusions', COALESCE((
      SELECT jsonb_agg(e.item->>'text' ORDER BY e.ord)
             FILTER (WHERE e.item->>'text' IS NOT NULL)
      FROM public.proposal_agreement_parts ap
      CROSS JOIN LATERAL jsonb_array_elements(
        CASE WHEN jsonb_typeof(ap.payload->'items') = 'array'
             THEN ap.payload->'items' ELSE '[]'::jsonb END
      ) WITH ORDINALITY AS e(item, ord)
      WHERE ap.proposal_id = p_proposal_id AND ap.part_key = 'patina.exclusions'
        AND ap.kind = 'list'
    ), '[]'::jsonb),
    'terms', (
      SELECT ap.payload->>'body' FROM public.proposal_agreement_parts ap
      WHERE ap.proposal_id = p_proposal_id AND ap.part_key = 'patina.terms'
        AND ap.kind = 'clause'
    ),
    'billingCeilingCents', (
      SELECT (ap.payload->>'cents')::integer FROM public.proposal_agreement_parts ap
      WHERE ap.proposal_id = p_proposal_id
        AND ap.kind = 'schedule' AND ap.variant = 'ceiling'
    ),
    'retainerAmountCents', COALESCE((
      SELECT (ap.payload->>'cents')::integer FROM public.proposal_agreement_parts ap
      WHERE ap.proposal_id = p_proposal_id
        AND ap.kind = 'schedule' AND ap.variant = 'retainer'
    ), 0),
    'retainerActivationPolicy', COALESCE((
      SELECT NULLIF(ap.payload->>'activationPolicy', '')
      FROM public.proposal_agreement_parts ap
      WHERE ap.proposal_id = p_proposal_id
        AND ap.kind = 'schedule' AND ap.variant = 'retainer'
    ), 'immediate'),
    'billingCadence', COALESCE((
      SELECT NULLIF(ap.payload->>'cadence', '') FROM public.proposal_agreement_parts ap
      WHERE ap.proposal_id = p_proposal_id
        AND ap.kind = 'schedule' AND ap.variant = 'cadence'
    -- 00578 (R9): a turnkey agreement bills on each draw, and that is the ONE
    -- authority this class writes. A design-build composition that carries no
    -- cadence part of its own still projects 'per_draw'; every other class
    -- keeps 00577's 'monthly'.
    ), CASE WHEN v_proposal.document_kind = 'design_build'
            THEN 'per_draw' ELSE 'monthly' END),
    'furnishingsDepositPercent', (
      SELECT (ap.payload->>'depositPercent')::numeric FROM public.proposal_agreement_parts ap
      WHERE ap.proposal_id = p_proposal_id
        AND ap.kind = 'schedule' AND ap.variant = 'procurement'
    ),
    'currency', COALESCE(v_existing.currency, 'USD'),
    'currentRateVersion', v_version
  );

  -- (B-9) effectiveAt rides through the parts door. Without it the
  -- projection falls to now() for every role, and
  -- classify_project_time_entry_authority filters authority rates on
  -- `effective_at <= started_at` — so a rate written for January stopped
  -- applying to January's hours the first time the agreement was opened in
  -- the Contract Room. A role that carries no date still falls to now(),
  -- which is what a rate written today means.
  v_rates := COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'version', v_version,
      'roleName', e.rate->>'roleName',
      'hourlyRateCents', (e.rate->>'hourlyRateCents')::integer,
      'sortOrder', COALESCE((e.rate->>'sortOrder')::integer, 0),
      'effectiveAt', NULLIF(e.rate->>'effectiveAt', '')
    ) ORDER BY e.ord)
    FROM public.proposal_agreement_parts ap
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE WHEN jsonb_typeof(ap.payload->'roles') = 'array'
           THEN ap.payload->'roles' ELSE '[]'::jsonb END
    ) WITH ORDINALITY AS e(rate, ord)
    WHERE ap.proposal_id = p_proposal_id
      AND ap.kind = 'schedule' AND ap.variant = 'rate_card'
  ), '[]'::jsonb);

  -- true = the parts door, and only the parts door, may leave the ceiling
  -- NULL: a removed ceiling part is uncapped, not zero-capped.
  --
  -- R17(a): the GUC is set for exactly the width of the projection and put
  -- back after, so guard_agreement_projection_write refuses every other
  -- writer of the money row while this document has parts. Transaction-local
  -- (set_config's third argument), so it cannot leak past this statement.
  -- 00577 (P5, R9). WHAT CREATES AUTHORITY AND WHAT ONLY GETS RECORDED.
  -- flat and per_phase name the fee; a rate card means hourly; everything
  -- else a schedule can be — percent_of_cost, percent_of_spend, cost_plus,
  -- day_rate, package, pricing_basis, draws, allowances — writes NOTHING
  -- here. The rule lives in the projection rather than behind a chip in the
  -- room, because this RPC is GRANTed to authenticated: a hand-crafted
  -- cost_plus part sent straight through it must still leave fee_basis NULL.
  -- Read by SHAPE, like every other money figure in this body.
  --
  -- R33 — AND ONLY WHAT SHE CAN SEE. Every fee read here is client_visible,
  -- because the fee set is what CHARGES her: a studio-only flat fee beside a
  -- visible rate card used to send `flat / $8,000` to the money row and onto
  -- the executed authority, while the sentence she ticked named the rates and
  -- the keepsake she keeps never mentioned the eight thousand. Three surfaces
  -- of one agreement disagreeing, and the one that disagreed was the one that
  -- billed. compose_agreement_consent, _render_agreement_snapshot_html and
  -- R22's floor all read client_visible already; this was the only reader that
  -- did not. A hidden fee is recorded on the agreement and reaches the money
  -- row not at all — the same answer R9 gives a cost_plus.
  --
  -- proposal_service_rates is NOT filtered that way, and deliberately: R33
  -- names proposal_service_terms and the authority, and the rate rows are a
  -- third thing — the send door refuses a rate card with no rate rows behind
  -- it, in words about role rates rather than about a fee. A hidden rate card
  -- still cannot bill: it writes no fee_basis here, and R22's floor refuses
  -- the send while it is the only fee on the paper.
  SELECT ap.variant,
         CASE WHEN ap.variant = 'flat'
              THEN CASE WHEN jsonb_typeof(ap.payload->'cents') = 'number'
                        THEN (ap.payload->>'cents')::integer END
              ELSE (SELECT sum((e.phase->>'cents')::integer)
                    FROM jsonb_array_elements(
                           CASE WHEN jsonb_typeof(ap.payload->'phases') = 'array'
                                THEN ap.payload->'phases' ELSE '[]'::jsonb END)
                      AS e(phase)
                    WHERE jsonb_typeof(e.phase->'cents') = 'number') END,
         CASE WHEN ap.variant = 'per_phase'
              THEN CASE WHEN jsonb_typeof(ap.payload->'phases') = 'array'
                        THEN ap.payload->'phases' ELSE '[]'::jsonb END END
    INTO v_fee_basis, v_fee_amount_cents, v_fee_schedule
  FROM public.proposal_agreement_parts ap
  WHERE ap.proposal_id = p_proposal_id
    AND ap.kind = 'schedule' AND ap.variant IN ('flat', 'per_phase')
    AND ap.client_visible;

  IF v_fee_basis IS NULL THEN
    v_fee_amount_cents := NULL;
    v_fee_schedule := NULL;
    IF EXISTS (SELECT 1 FROM public.proposal_agreement_parts ap
               WHERE ap.proposal_id = p_proposal_id
                 AND ap.kind = 'schedule' AND ap.variant = 'rate_card'
                 AND ap.client_visible) THEN
      v_fee_basis := 'hourly';
    END IF;
  END IF;

  -- true = the parts door, and only the parts door, may leave the ceiling
  -- NULL: a removed ceiling part is uncapped, not zero-capped.
  --
  -- R17(a): the GUC is set for exactly the width of the projection and put
  -- back after, so guard_agreement_projection_write refuses every other
  -- writer of the money row while this document has parts. Transaction-local
  -- (set_config's third argument), so it cannot leak past this statement.
  PERFORM set_config('app.agreement_projection', p_proposal_id::text, true);
  PERFORM public._project_agreement_terms(p_proposal_id, v_terms, v_rates, true);

  -- 00577: the four Wave-2 figures, written inside the SAME projection window
  -- and as their own statement rather than as four more arguments to
  -- _project_agreement_terms — that helper is ALSO the seven-facet room's
  -- writer, and the flag-off door must keep writing exactly what 00422 wrote.
  UPDATE public.proposal_service_terms t SET
    retainer_credit_rule = COALESCE((
      SELECT NULLIF(btrim(COALESCE(ap.payload->>'creditRule', '')), '')
      FROM public.proposal_agreement_parts ap
      WHERE ap.proposal_id = p_proposal_id
        AND ap.kind = 'schedule' AND ap.variant = 'retainer'
    ), 'credited'),
    fee_basis = v_fee_basis,
    fee_amount_cents = v_fee_amount_cents,
    fee_schedule = v_fee_schedule,
    updated_at = now()
  WHERE t.proposal_id = p_proposal_id;

  PERFORM set_config('app.agreement_projection', COALESCE(v_previous_projection, ''), true);

  -- 00577 (P8): what moved, and the designer's one line about why. A no-op
  -- save writes nothing at all — the diff is empty — so a room that autosaves
  -- does not fill the history strip with silence.
  SELECT COALESCE(jsonb_agg(to_jsonb(ap) - 'created_at' - 'updated_at' - 'proposal_id'
                            ORDER BY ap.position, ap.id), '[]'::jsonb)
  INTO v_after
  FROM public.proposal_agreement_parts ap WHERE ap.proposal_id = p_proposal_id;
  PERFORM public._log_agreement_part_events(p_proposal_id, v_before, v_after, p_why);

  PERFORM set_config('app.commercial_document_id', COALESCE(v_previous_commercial, ''), true);
  -- The saved rows come back, in order, exactly as materialize_standard_parts
  -- returns them. The write is DELETE-then-INSERT and does not carry `id`
  -- through, so every part has a NEW uuid — a room that kept the array it
  -- sent would be holding ids the table no longer has, and the next save
  -- would look like a rename of nine parts. One round trip, one truth.
  RETURN jsonb_build_object(
    'proposalId', p_proposal_id,
    'documentKind', CASE WHEN v_proposal.document_kind = 'legacy'
                         THEN 'design_services' ELSE v_proposal.document_kind END,
    'commercialState', 'draft',
    'partCount', jsonb_array_length(p_parts),
    'documentFingerprint', public._commercial_document_fingerprint(p_proposal_id),
    'parts', COALESCE((
      SELECT jsonb_agg(to_jsonb(ap) ORDER BY ap.position, ap.id)
      FROM public.proposal_agreement_parts ap WHERE ap.proposal_id = p_proposal_id
    ), '[]'::jsonb)
  );
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('app.agreement_projection', COALESCE(v_previous_projection, ''), true);
  PERFORM set_config('app.commercial_document_id', COALESCE(v_previous_commercial, ''), true);
  RAISE;
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- PART 8b — materialize_agreement_template: the class map and the gate (R10)
-- 
-- Two grafts on 00576's head body.
-- 
-- THE GATE. Before anything is written, a design_build class demands a live
-- licensing attestation on the studio the AGREEMENT sits in — resolved by
-- _agreement_studio_id, R32's answer, never by counting the actor's
-- studios. This is one of the two load-bearing depths (the other is the
-- send door); the picker's disabled state is a courtesy.
-- 
-- THE CLASS MAP. A design_build template flips proposals.document_kind in
-- the same transaction that writes the parts, under the lifecycle GUC
-- app.commercial_document_id — and BEFORE upsert_agreement_parts runs, so
-- that RPC's own kind allowlist, its 'per_draw' projection and its turnkey
-- validators all see the kind the document actually is.
-- ═══════════════════════════════════════════════════════════════════════════

-- Grafted VERBATIM from 00576_agreement_library.sql:718-877, then the delta below.
CREATE OR REPLACE FUNCTION public.materialize_agreement_template(
  p_proposal_id uuid,
  p_template_key text
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_proposal public.proposals%ROWTYPE;
  v_template public.agreement_templates%ROWTYPE;
  v_entry jsonb;
  v_library public.studio_agreement_parts%ROWTYPE;
  v_parts jsonb := '[]'::jsonb;
  v_key text;
  v_payload jsonb;
  v_studio_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'composing from a template requires an authenticated author'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_proposal FROM public.proposals
  WHERE id = p_proposal_id FOR UPDATE;
  IF NOT FOUND OR v_proposal.status <> 'draft'
     OR NOT public._can_author_proposal(v_proposal.designer_id)
  THEN
    RAISE EXCEPTION 'draft proposal % not found or access denied', p_proposal_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- The same visibility predicate agreement_templates_select states, asked
  -- here because this body is SECURITY DEFINER and that policy is not in
  -- force inside it.
  SELECT * INTO v_template FROM public.agreement_templates
  WHERE template_key = p_template_key
    AND (
      kind = 'seeded'
      OR (
        kind = 'studio'
        AND EXISTS (
          SELECT 1 FROM public.organizations AS studio
          WHERE studio.id = agreement_templates.studio_id
            AND studio.type = 'design_studio'
            AND studio.status = 'active'
            AND public.is_active_org_member(studio.id)
        )
      )
    );
  IF NOT FOUND THEN
    RAISE EXCEPTION 'template not found or not accessible'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- R2 — a Template belongs to ONE studio, and so does the agreement it lands
  -- in. The visibility predicate above answers "may this member see it", which
  -- for a designer who belongs to two studios is a different question from
  -- "does it belong to THIS agreement's studio": without this block she could
  -- materialize studio B's private Template into studio A's paper, and the
  -- part rows would carry B's template key into A's Library forever.
  --
  -- R32 — the studio is resolved EXACTLY the way save_agreement_as_template
  -- resolves it, through _agreement_studio_id: the project's studio once the
  -- agreement is bound, else the lead designer's studios in 00563's order,
  -- with the actor's own standing asserted afterwards. Counting the studios
  -- the actor and the lead SHARE is what broke — a designer in two studios who
  -- is herself the lead answers "two" for both people and was refused every
  -- studio Template, her own included — and accepting any one of them is what
  -- leaked studio B's private paper onto studio A's agreement before that.
  IF v_template.studio_id IS NOT NULL THEN
    v_studio_id := public._agreement_studio_id(p_proposal_id, auth.uid());

    IF v_studio_id IS NULL THEN
      RAISE EXCEPTION 'this agreement does not sit in a studio you compose in, so a studio Template cannot be composed into it'
        USING ERRCODE = 'insufficient_privilege';
    END IF;

    IF v_template.studio_id <> v_studio_id THEN
      RAISE EXCEPTION 'template belongs to another studio'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  -- 00578 (R10). THE ATTESTATION GATE, asked before a single row is written.
  -- Patina stores the studio's statement and never verifies it; what a live
  -- statement buys is the right to compose this template at all. The studio
  -- is the AGREEMENT's studio (R32), and an expired attestation is no
  -- attestation — the same predicate the send door asks again later, because
  -- a credential can lapse between composing and sending.
  IF v_template.class = 'design_build' THEN
    IF v_studio_id IS NULL THEN
      v_studio_id := public._agreement_studio_id(p_proposal_id, auth.uid());
    END IF;
    IF NOT public.studio_has_live_license_attestation(v_studio_id) THEN
      RAISE EXCEPTION 'the design-build template needs a current licensing attestation on file'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  FOR v_entry IN
    SELECT value FROM jsonb_array_elements(
      CASE WHEN jsonb_typeof(v_template.parts) = 'array'
           THEN v_template.parts ELSE '[]'::jsonb END)
  LOOP
    IF jsonb_typeof(v_entry) <> 'object' THEN
      CONTINUE;
    END IF;

    -- 00578 (R16, R11's posture) — A TEMPLATE MAY CARRY A PART IT DOES NOT YET
    -- COMPOSE. An entry marked `enabled: false` is on file and nothing more:
    -- counsel can read it, a migration can flip it, and until then it reaches
    -- no rail, no homeowner and no Trade Agreement. This is how the seeded
    -- flow-down clause ships (PART 13), for the same reason the six
    -- jurisdiction notices ship dark — the wording has not been reviewed, and
    -- an unreviewed clause that composes itself into a contract is exactly the
    -- accident the ruling is written to prevent. Absent, the key defaults to
    -- true, so every other seeded entry composes as it always has.
    IF NOT COALESCE((v_entry->>'enabled')::boolean, true) THEN
      CONTINUE;
    END IF;

    v_key := NULLIF(btrim(COALESCE(v_entry->>'partKey', '')), '');

    IF v_key IS NOT NULL AND v_key LIKE 'studio.%' THEN
      -- A Library part the studio may since have deleted. A template that
      -- names one must not brick: the entry is skipped and the rest lands.
      v_library := NULL;
      SELECT * INTO v_library FROM public.studio_agreement_parts
      WHERE studio_id = v_template.studio_id AND part_key = v_key;
      IF NOT FOUND THEN
        CONTINUE;
      END IF;

      v_payload := public._agreement_restore_list_item_ids(
        public.sanitize_agreement_part_payload(
          COALESCE(v_entry->'payload', v_library.payload)));

      v_parts := v_parts || jsonb_build_array(jsonb_build_object(
        'kind', v_library.kind,
        'variant', v_library.variant,
        'partKey', v_library.part_key,
        'title', COALESCE(NULLIF(btrim(COALESCE(v_entry->>'title', '')), ''),
                          v_library.title),
        'payload', v_payload,
        'required', COALESCE((v_entry->>'required')::boolean,
                             v_library.required_default),
        'clientVisible', COALESCE((v_entry->>'clientVisible')::boolean,
                                  v_library.client_visible_default),
        'sourceTemplateKey', v_template.template_key,
        'sourcePartId', v_library.id::text
      ));
    ELSE
      -- An inline body. This is how the seeded templates carry their parts.
      IF v_key IS NULL THEN
        CONTINUE;
      END IF;
      v_payload := public._agreement_restore_list_item_ids(
        public.sanitize_agreement_part_payload(
          COALESCE(v_entry->'payload', '{}'::jsonb)));

      v_parts := v_parts || jsonb_build_array(jsonb_build_object(
        'kind', btrim(COALESCE(v_entry->>'kind', '')),
        'variant', NULLIF(btrim(COALESCE(v_entry->>'variant', '')), ''),
        'partKey', v_key,
        'title', btrim(COALESCE(v_entry->>'title', '')),
        'payload', v_payload,
        'required', COALESCE((v_entry->>'required')::boolean, false),
        'clientVisible', COALESCE((v_entry->>'clientVisible')::boolean, true),
        'sourceTemplateKey', v_template.template_key,
        'sourcePartId', NULL
      ));
    END IF;
  END LOOP;

  IF jsonb_array_length(v_parts) = 0 THEN
    RAISE EXCEPTION 'this template has no parts left to compose from'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Replaces the draft's part set wholesale — that is what the room's
  -- confirmation warns about — and does it through the ONE writer, so the
  -- money projection, the fingerprint and the change history all run.
  -- 00578: the kind flips HERE, not at draft creation
  -- (draft-proposal-opener.tsx hardcodes 'design_services' and deliberately
  -- keeps doing so), and it flips BEFORE the one writer runs so that
  -- upsert_agreement_parts sees the kind it is composing.
  IF v_template.class = 'design_build' THEN
    PERFORM set_config(
      'app.commercial_document_id', p_proposal_id::text, true);
    UPDATE public.proposals
    SET document_kind = 'design_build', commercial_state = 'draft',
        updated_at = now()
    WHERE id = p_proposal_id;
    PERFORM set_config('app.commercial_document_id', '', true);
  END IF;

  PERFORM public.upsert_agreement_parts(
    p_proposal_id, v_parts, 'Materialized from ' || v_template.title);

  RETURN jsonb_array_length(v_parts);
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- PART 9 — _countersign_design_services_agreement_impl: pass the kind through
-- 
-- Four deltas on 00577's head body: two kind scopes (the authorized read
-- and the locked re-read), the origin bootstrap leg, and the hardcoded
-- 'design_services' literal in the origin-document INSERT, which becomes
-- v_proposal.document_kind so the executed document records the class it
-- actually is. The addendum lookup is untouched — a design_build proposal
-- is always an origin and never an addendum this wave.
-- 
-- The authority INSERT already reads v_terms.billing_cadence, so 'per_draw'
-- flows through the moment PART 2's CHECK admits it (R9, RC-5).
-- 
-- This function is body-hash pinned; the pin moves in the same change.
-- ═══════════════════════════════════════════════════════════════════════════

-- Grafted VERBATIM from 00577_agreement_fee_schedules.sql:1942-2548, then the delta below.
CREATE OR REPLACE FUNCTION public._countersign_design_services_agreement_impl(
  p_proposal_id uuid,
  p_signer_name text,
  p_disclosed_impact jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_proposal public.proposals%ROWTYPE;
  v_project public.projects%ROWTYPE;
  v_authority_studio_id uuid;
  v_client_signature public.commercial_document_signatures%ROWTYPE;
  v_studio_signature public.commercial_document_signatures%ROWTYPE;
  v_terms public.proposal_service_terms%ROWTYPE;
  v_fingerprint text;
  v_project_id uuid;
  v_document_id uuid;
  v_authority_id uuid;
  v_retainer_invoice_id uuid;
  v_authorized_cents bigint := 0;
  v_pending_entry record;
  v_newly_executed boolean := false;
  v_name text := btrim(COALESCE(p_signer_name, ''));
  v_previous_accept text := current_setting('app.proposal_accept_id', true);
  v_previous_commercial text := current_setting('app.commercial_document_id', true);
  v_anchor_phase_id uuid;   -- 00475
  -- plpgsql forbids a row variable in a multi-item INTO list, so the paired
  -- composites land in one record and are unpacked below.
  v_row_4180 record;
  v_row_4359 record;
BEGIN
  IF v_actor IS NULL OR char_length(v_name) < 2 THEN
    RAISE EXCEPTION 'studio countersign requires an authenticated signer and legal name'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT proposal.* INTO v_proposal
  FROM public.proposals AS proposal
  WHERE proposal.id = p_proposal_id
    AND proposal.client_id IS NOT NULL
    AND proposal.document_kind IN ('design_services', 'service_addendum', 'design_build')
    AND (
      EXISTS (
        SELECT 1
        FROM public.project_commercial_documents AS document
        JOIN public.projects AS project ON project.id = document.project_id
        JOIN public.organizations AS studio ON studio.id = project.studio_id
        JOIN public.organization_members AS actor_membership
          ON actor_membership.organization_id = project.studio_id
         AND actor_membership.user_id = v_actor
        JOIN public.organization_members AS lead_membership
          ON lead_membership.organization_id = project.studio_id
         AND lead_membership.user_id = project.designer_id
        JOIN public.user_roles AS user_role
          ON user_role.user_id = project.designer_id
        JOIN public.roles AS role ON role.id = user_role.role_id
        WHERE document.proposal_id = proposal.id
          AND document.document_kind = proposal.document_kind
          AND (proposal.project_id IS NULL OR proposal.project_id = project.id)
          AND project.client_id = proposal.client_id
          AND project.status = 'active'
          AND studio.type = 'design_studio'
          AND studio.status = 'active'
          AND actor_membership.status = 'active'
          AND actor_membership.role <> 'guest'
          AND lead_membership.status = 'active'
          AND lead_membership.role <> 'guest'
          AND role.domain = 'designer'
      )
      OR (
        proposal.document_kind IN ('design_services', 'design_build')
        AND proposal.project_id IS NULL
        AND NOT EXISTS (
          SELECT 1
          FROM public.project_commercial_documents AS bound_document
          WHERE bound_document.proposal_id = proposal.id
        )
        AND EXISTS (
          SELECT 1
          FROM public.user_roles AS user_role
          JOIN public.roles AS role ON role.id = user_role.role_id
          WHERE user_role.user_id = proposal.designer_id
            AND role.domain = 'designer'
        )
        -- 00566. Same count-to-membership correction as the signature guard.
        AND EXISTS (
          SELECT 1
          FROM public.organizations AS studio
          JOIN public.organization_members AS lead_membership
            ON lead_membership.organization_id = studio.id
           AND lead_membership.user_id = proposal.designer_id
          JOIN public.organization_members AS actor_membership
            ON actor_membership.organization_id = studio.id
           AND actor_membership.user_id = v_actor
          WHERE studio.type = 'design_studio'
            AND studio.status = 'active'
            AND lead_membership.status = 'active'
            AND lead_membership.role <> 'guest'
            AND actor_membership.status = 'active'
            AND actor_membership.role <> 'guest'
        )
      )
    );
  IF NOT FOUND THEN
    RAISE EXCEPTION 'design services agreement % not found or access denied', p_proposal_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT document.id, document.project_id, project
  INTO v_row_4180
  FROM public.project_commercial_documents AS document
  JOIN public.projects AS project ON project.id = document.project_id
  JOIN public.organizations AS studio ON studio.id = project.studio_id
  JOIN public.organization_members AS actor_membership
    ON actor_membership.organization_id = project.studio_id
   AND actor_membership.user_id = v_actor
  JOIN public.organization_members AS lead_membership
    ON lead_membership.organization_id = project.studio_id
   AND lead_membership.user_id = project.designer_id
  WHERE document.proposal_id = p_proposal_id
    AND document.document_kind = v_proposal.document_kind
    AND (v_proposal.project_id IS NULL OR v_proposal.project_id = project.id)
    AND project.client_id = v_proposal.client_id
    AND project.status = 'active'
    AND studio.type = 'design_studio'
    AND studio.status = 'active'
    AND actor_membership.status = 'active'
    AND actor_membership.role <> 'guest'
    AND lead_membership.status = 'active'
    AND lead_membership.role <> 'guest';

  v_document_id := v_row_4180.id;
  v_project_id := v_row_4180.project_id;
  v_project := v_row_4180.project;

  IF FOUND THEN
    SELECT project.* INTO v_project
    FROM public.projects AS project
    WHERE project.id = v_project_id
      AND project.client_id = v_proposal.client_id
      AND project.designer_id = v_project.designer_id
      AND project.studio_id = v_project.studio_id
      AND project.status = 'active'
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'design services agreement % not found or access denied', p_proposal_id
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    v_authority_studio_id := v_project.studio_id;
  ELSE
    -- 00566. The candidate set is EXACTLY 00563's (00563:255-278): the LEAD
    -- designer's own active non-guest memberships in active design studios,
    -- in 00563's order — a studio already hosting a project for this exact
    -- designer-client pair first, then 00317's owner-first, earliest-joined
    -- rule, organization id last for a total order. 00563 also carries
    -- has_designer_domain_role(designer_id) in that set; it is a per-designer
    -- predicate, already required of this lead by the access leg above, so
    -- the two sets are the same rows.
    --
    -- Resolving over the lead-AND-actor intersection instead (as the lowest-
    -- uuid body did) would let this function bind one studio while the
    -- project insert below runs set_project_studio_id, which sees only the
    -- LEAD's studios, and stamps another: a lead in studios A+B countersigned
    -- by a co-member of B alone bound B here and A there, and the trigger
    -- refused in its own opaque words. Both sides now answer the same
    -- question, and the countersigner's standing in the answer is stated
    -- immediately below. No row lock is taken, so the canonical
    -- roles -> user_roles -> memberships -> organization acquisition order
    -- below is unchanged.
    SELECT studio.id
    INTO v_authority_studio_id
    FROM public.organizations AS studio
    JOIN public.organization_members AS lead_membership
      ON lead_membership.organization_id = studio.id
     AND lead_membership.user_id = v_proposal.designer_id
    WHERE studio.type = 'design_studio'
      AND studio.status = 'active'
      AND lead_membership.status = 'active'
      AND lead_membership.role <> 'guest'
    ORDER BY
      EXISTS (
        SELECT 1
        FROM public.projects AS sibling
        WHERE sibling.studio_id = studio.id
          AND sibling.designer_id = v_proposal.designer_id
          AND sibling.client_id = v_proposal.client_id
      ) DESC,
      (lead_membership.role = 'owner') DESC,
      lead_membership.joined_at NULLS LAST,
      lead_membership.created_at,
      studio.id
    LIMIT 1;

    -- The studio above is the LEAD's answer, so the countersigner's own
    -- standing in it is asserted rather than assumed — the same check 00563
    -- makes of set_project_studio_id's actor before it returns. Refusing here
    -- names the failure at the point it happens; the authority legs further
    -- down re-check it under lock. Zero shared studios still fails closed.
    IF v_authority_studio_id IS NOT NULL AND NOT EXISTS (
      SELECT 1
      FROM public.organization_members AS actor_membership
      WHERE actor_membership.organization_id = v_authority_studio_id
        AND actor_membership.user_id = v_actor
        AND actor_membership.status = 'active'
        AND actor_membership.role <> 'guest'
    ) THEN
      RAISE EXCEPTION 'design services agreement % not found or access denied', p_proposal_id
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  SELECT proposal.* INTO v_proposal
  FROM public.proposals AS proposal
  WHERE proposal.id = p_proposal_id
    AND proposal.client_id IS NOT NULL
    AND proposal.document_kind IN ('design_services', 'service_addendum', 'design_build')
    AND (
      v_project_id IS NULL
      OR proposal.project_id IS NULL
      OR proposal.project_id = v_project_id
    )
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'design services agreement % not found or access denied', p_proposal_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_document_id IS NOT NULL THEN
    PERFORM document.id
    FROM public.project_commercial_documents AS document
    WHERE document.id = v_document_id
      AND document.proposal_id = v_proposal.id
      AND document.project_id = v_project_id
      AND document.document_kind = v_proposal.document_kind
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'design services agreement % not found or access denied', p_proposal_id
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  PERFORM role.id
  FROM public.roles AS role
  WHERE role.domain = 'designer'
  ORDER BY role.id
  FOR SHARE;

  PERFORM user_role.id
  FROM public.user_roles AS user_role
  JOIN public.roles AS role ON role.id = user_role.role_id
  WHERE user_role.user_id = COALESCE(v_project.designer_id, v_proposal.designer_id)
    AND role.domain = 'designer'
  ORDER BY user_role.role_id, user_role.id
  FOR SHARE OF user_role;
  IF v_authority_studio_id IS NULL OR NOT FOUND THEN
    RAISE EXCEPTION 'design services agreement % not found or access denied', p_proposal_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  PERFORM membership.id
  FROM public.organization_members AS membership
  WHERE membership.organization_id = v_authority_studio_id
    AND membership.user_id = ANY(ARRAY[
      COALESCE(v_project.designer_id, v_proposal.designer_id), v_actor
    ]::uuid[])
  ORDER BY membership.user_id, membership.id
  FOR SHARE;

  PERFORM studio.id
  FROM public.organizations AS studio
  WHERE studio.id = v_authority_studio_id
  ORDER BY studio.id
  FOR SHARE;

  IF NOT EXISTS (
       SELECT 1 FROM public.organizations AS studio
       WHERE studio.id = v_authority_studio_id
         AND studio.type = 'design_studio'
         AND studio.status = 'active'
     )
     OR NOT EXISTS (
       SELECT 1 FROM public.organization_members AS membership
       WHERE membership.organization_id = v_authority_studio_id
         AND membership.user_id = COALESCE(
           v_project.designer_id, v_proposal.designer_id
         )
         AND membership.status = 'active'
         AND membership.role <> 'guest'
     )
     OR NOT EXISTS (
       SELECT 1 FROM public.organization_members AS membership
       WHERE membership.organization_id = v_authority_studio_id
         AND membership.user_id = v_actor
         AND membership.status = 'active'
         AND membership.role <> 'guest'
     )
     OR (
       v_project_id IS NULL
       -- 00566. Was `1 <> count(...)`. The lead designer must still hold a
       -- live studio, but plural studios are no longer a refusal: the exact
       -- studio this countersign binds to was resolved above and its lead and
       -- actor memberships are re-checked immediately before this leg.
       AND NOT EXISTS (
         SELECT 1
         FROM public.organization_members AS membership
         JOIN public.organizations AS studio
           ON studio.id = membership.organization_id
         WHERE membership.user_id = v_proposal.designer_id
           AND membership.status = 'active'
           AND membership.role <> 'guest'
           AND studio.type = 'design_studio'
           AND studio.status = 'active'
       )
     )
  THEN
    RAISE EXCEPTION 'design services agreement % not found or access denied', p_proposal_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_client_signature FROM public.commercial_document_signatures
  WHERE proposal_id = p_proposal_id AND party_role = 'client' FOR SHARE;
  v_fingerprint := public._commercial_document_fingerprint(p_proposal_id);
  IF v_client_signature.id IS NULL
     OR v_client_signature.signer_user_id IS DISTINCT FROM v_proposal.client_id
     OR v_client_signature.evidence_fingerprint IS DISTINCT FROM v_fingerprint
  THEN
    RAISE EXCEPTION 'studio countersign requires the exact current client consent fingerprint'
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_proposal.commercial_state = 'executed' THEN
    SELECT document.id AS document_id, document.project_id AS project_id,
           authority.id AS authority_id,
           authority.retainer_invoice_id AS retainer_invoice_id,
           project AS project_row
    INTO v_row_4359
    FROM public.project_commercial_documents AS document
    JOIN public.projects AS project ON project.id = document.project_id
    JOIN public.project_billing_authorities AS authority
      ON authority.commercial_document_id = document.id
    WHERE document.proposal_id = p_proposal_id;

    v_document_id := v_row_4359.document_id;
    v_project_id := v_row_4359.project_id;
    v_authority_id := v_row_4359.authority_id;
    v_retainer_invoice_id := v_row_4359.retainer_invoice_id;
    v_project := v_row_4359.project_row;

    SELECT * INTO v_studio_signature FROM public.commercial_document_signatures
    WHERE proposal_id = p_proposal_id AND party_role = 'studio';
    IF v_document_id IS NULL OR v_studio_signature.id IS NULL
       OR v_studio_signature.evidence_fingerprint IS DISTINCT FROM v_fingerprint
    THEN
      RAISE EXCEPTION 'executed agreement has incomplete authority topology'
        USING ERRCODE = 'check_violation';
    END IF;
  ELSIF v_proposal.commercial_state = 'client_signed' THEN
    IF EXISTS (SELECT 1 FROM public.proposal_items i WHERE i.proposal_id = p_proposal_id) THEN
      RAISE EXCEPTION 'design services agreement must not carry furnishing items'
        USING ERRCODE = 'check_violation';
    END IF;
    SELECT * INTO STRICT v_terms FROM public.proposal_service_terms
    WHERE proposal_id = p_proposal_id;

    INSERT INTO public.commercial_document_signatures (
      proposal_id, party_role, signer_user_id, signed_name,
      evidence_fingerprint, metadata
    ) VALUES (
      p_proposal_id, 'studio', v_actor, v_name, v_fingerprint,
      jsonb_build_object('via', 'countersign_design_services_agreement')
    ) RETURNING * INTO v_studio_signature;

    PERFORM set_config('app.proposal_accept_id', p_proposal_id::text, true);
    PERFORM set_config('app.commercial_document_id', p_proposal_id::text, true);
    UPDATE public.proposals SET
      status = 'accepted', commercial_state = 'executed',
      signed_at = v_client_signature.signed_at,
      signed_by_name = v_client_signature.signed_name,
      -- 00414: signed_ip is NOT mirrored onto proposals (see the execution
      -- rail above and the column grant at the foot of this file). The
      -- client signature row keeps the IP; public.proposals does not.
      accepted_at = v_studio_signature.signed_at,
      updated_at = now()
    WHERE id = p_proposal_id;

    IF v_proposal.document_kind IN ('design_services', 'design_build') THEN
      -- Current private bridge is the 00398 wrapper around the long-lived
      -- 00331 implementation. It preserves every project/proposal guard.
      v_project_id := public._activate_proposal_as_project_authorized(
        p_proposal_id, current_date
      );
      SELECT project.* INTO STRICT v_project
      FROM public.projects AS project
      WHERE project.id = v_project_id
      FOR SHARE;
      INSERT INTO public.project_commercial_documents (
        project_id, proposal_id, document_kind, is_origin, executed_at, created_by
      ) VALUES (
        v_project_id, p_proposal_id, v_proposal.document_kind, true,
        v_studio_signature.signed_at, v_actor
      ) RETURNING id INTO v_document_id;

      -- 00475 (R109 ceremony class): execution IS the engagement start.
      -- Anchors the first main-lane phase to the day authority took effect.
      -- Only the origin agreement anchors — an addendum re-executes billing
      -- authority, not the engagement.
      v_anchor_phase_id := public._schedule_engagement_start_phase(v_project_id);
      IF v_anchor_phase_id IS NOT NULL THEN
        PERFORM public._commit_schedule_edit_authorized(
          v_project_id,
          jsonb_build_array(jsonb_build_object(
            'kind', 'phase-anchor',
            'phase_id', v_anchor_phase_id,
            'anchor_date', to_char(current_date, 'YYYY-MM-DD'),
            'source_ref', p_proposal_id
          )),
          'Design services agreement executed',
          p_disclosed_impact,
          'ceremony:design-services-executed'
        );
      END IF;
    ELSE
      SELECT document.id, document.project_id
      INTO v_document_id, v_project_id
      FROM public.project_commercial_documents AS document
      WHERE document.proposal_id = p_proposal_id
        AND document.document_kind = 'service_addendum';
      SELECT project.* INTO v_project
      FROM public.projects AS project
      WHERE project.id = v_project_id
      FOR UPDATE;
      PERFORM document.id
      FROM public.project_commercial_documents AS document
      WHERE document.id = v_document_id
        AND document.project_id = v_project_id
      FOR UPDATE;
      IF v_document_id IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.project_commercial_documents origin
        JOIN public.proposals origin_proposal ON origin_proposal.id = origin.proposal_id
        WHERE origin.project_id = v_project_id AND origin.is_origin
          AND origin_proposal.commercial_state = 'executed'
      ) THEN
        RAISE EXCEPTION 'service addendum has no executed project origin'
          USING ERRCODE = 'check_violation';
      END IF;
      -- Different addenda lock different proposal rows. Serialize their
      -- authority replacement on the shared project before ending/inserting
      -- the one active authority enforced by the partial unique index.
      PERFORM 1 FROM public.projects
      WHERE id = v_project_id
      FOR UPDATE;
      UPDATE public.project_commercial_documents
      SET executed_at = v_studio_signature.signed_at
      WHERE id = v_document_id;
      UPDATE public.project_billing_authorities
      SET status = 'superseded', ended_at = v_studio_signature.signed_at
      WHERE project_id = v_project_id AND status = 'active';
    END IF;

    IF v_terms.retainer_amount_cents > 0 THEN
      INSERT INTO public.invoices (
        project_id, designer_id, client_id, status, currency,
        subtotal_cents, tax_rate, tax_cents, total_cents, memo
      ) VALUES (
        v_project_id, v_project.designer_id, v_proposal.client_id, 'draft', 'USD',
        v_terms.retainer_amount_cents, 0, 0, v_terms.retainer_amount_cents,
        'Design services retainer · ' || v_proposal.title
      ) RETURNING id INTO v_retainer_invoice_id;
      INSERT INTO public.invoice_line_items (
        invoice_id, kind, description, quantity, unit_amount_cents,
        amount_cents, metadata
      ) VALUES (
        v_retainer_invoice_id, 'adhoc', 'Design services retainer', 1,
        v_terms.retainer_amount_cents, v_terms.retainer_amount_cents,
        jsonb_build_object('commercialDocumentId', v_document_id, 'kind', 'design_services_retainer')
      );
      PERFORM app_private.issue_invoice_for_actor(
        v_retainer_invoice_id, current_date, v_actor
      );
    END IF;

    -- 00577 (P5): the four Wave-2 fee columns snapshot with the rest of the
    -- terms row. An authority that cannot say what the fee basis was is an
    -- authority that forgot the agreement the moment it executed.
    INSERT INTO public.project_billing_authorities (
      project_id, commercial_document_id, source_proposal_id,
      billing_ceiling_cents, retainer_amount_cents, retainer_activation_policy,
      billing_cadence, retainer_invoice_id, effective_at,
      retainer_credit_rule, fee_basis, fee_amount_cents, fee_schedule
    ) VALUES (
      v_project_id, v_document_id, p_proposal_id,
      v_terms.billing_ceiling_cents, v_terms.retainer_amount_cents,
      v_terms.retainer_activation_policy, v_terms.billing_cadence, v_retainer_invoice_id,
      v_studio_signature.signed_at,
      COALESCE(v_terms.retainer_credit_rule, 'credited'),
      v_terms.fee_basis, v_terms.fee_amount_cents, v_terms.fee_schedule
    ) RETURNING id INTO v_authority_id;

    -- 00577 (R12, P6): THE COPY SHE KEEPS. Composed server-side from the
    -- parts she could actually read, stamped with the very fingerprint both
    -- parties signed against, and never re-rendered on a later read — that is
    -- what makes it a keepsake rather than a view. No PDF (R12).
    --
    -- ON CONFLICT DO NOTHING because countersign is retry-safe, and guarded on
    -- the document having parts because a legacy agreement has no composition
    -- to freeze — it executes exactly as it did before this file.
    --
    -- Placed after the authority INSERT, which is after every lock this
    -- function takes, so the authority-lock-order contract is untouched.
    IF EXISTS (SELECT 1 FROM public.proposal_agreement_parts pp
               WHERE pp.proposal_id = p_proposal_id) THEN
      INSERT INTO public.agreement_execution_snapshots (
        proposal_id, html, part_set, document_hash
      ) VALUES (
        p_proposal_id,
        public._render_agreement_snapshot_html(p_proposal_id),
        COALESCE((SELECT jsonb_agg(to_jsonb(pp) - 'created_at' - 'updated_at'
                                   ORDER BY pp.position)
                  FROM public.proposal_agreement_parts pp
                  WHERE pp.proposal_id = p_proposal_id), '[]'::jsonb),
        v_fingerprint
      ) ON CONFLICT (proposal_id) DO NOTHING;
    END IF;

    INSERT INTO public.project_billing_authority_rates (
      billing_authority_id, source_rate_id, version, role_name, hourly_rate_cents
    ) SELECT v_authority_id, r.id, r.version, r.role_name, r.hourly_rate_cents
      FROM public.proposal_service_rates r
      WHERE r.proposal_id = p_proposal_id
      ORDER BY r.version, r.sort_order, r.role_name;

    IF v_proposal.document_kind = 'service_addendum' THEN
      SELECT COALESCE(sum(entry.rated_amount_cents), 0)
      INTO v_authorized_cents
      FROM public.project_time_entries entry
      WHERE entry.project_id = v_project_id
        AND entry.billing_state = 'authorized'
        AND entry.billable AND entry.duration_minutes IS NOT NULL;

      -- A replacement ceiling is cumulative across the project. Promote only
      -- the oldest already-rated pending work that now fits; its historical
      -- authority/rate/amount snapshots never change.
      FOR v_pending_entry IN
        SELECT entry.id, entry.rated_amount_cents
        FROM public.project_time_entries entry
        JOIN public.project_billing_authorities prior_authority
          ON prior_authority.id = entry.billing_authority_id
        WHERE entry.project_id = v_project_id
          AND entry.billing_state = 'pending_authorization'
          AND entry.billable AND entry.duration_minutes IS NOT NULL
          AND entry.rated_amount_cents IS NOT NULL
          AND entry.authority_rate_id IS NOT NULL
          AND entry.billing_authority_id <> v_authority_id
          AND (
            prior_authority.retainer_activation_policy = 'immediate'
            OR prior_authority.retainer_amount_cents = 0
            OR EXISTS (
              SELECT 1 FROM public.invoices paid_retainer
              WHERE paid_retainer.id = prior_authority.retainer_invoice_id
                AND paid_retainer.status = 'paid'
                AND paid_retainer.amount_paid_cents >= paid_retainer.total_cents
            )
          )
        ORDER BY entry.started_at, entry.id
        FOR UPDATE OF entry
      LOOP
        -- 00575 (F-2): a NULL ceiling is UNCAPPED. Left as written, the
        -- comparison evaluates NULL, the IF takes the false branch, and
        -- nothing is ever authorized on an uncapped agreement.
        IF v_terms.billing_ceiling_cents IS NULL
           OR v_authorized_cents + v_pending_entry.rated_amount_cents
              <= v_terms.billing_ceiling_cents THEN
          UPDATE public.project_time_entries
          SET billing_state = 'authorized', updated_at = now()
          WHERE id = v_pending_entry.id;
          v_authorized_cents := v_authorized_cents + v_pending_entry.rated_amount_cents;
        END IF;
      END LOOP;
    END IF;

    PERFORM set_config('app.proposal_accept_id', COALESCE(v_previous_accept, ''), true);
    PERFORM set_config('app.commercial_document_id', COALESCE(v_previous_commercial, ''), true);
    v_newly_executed := true;
  ELSE
    RAISE EXCEPTION 'design services agreement % is not ready to countersign (%)',
      p_proposal_id, COALESCE(v_proposal.commercial_state, 'NULL')
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN jsonb_build_object(
    'agreementId', p_proposal_id,
    'proposalId', p_proposal_id,
    'commercialState', 'executed',
    'projectId', v_project_id,
    'billingAuthorityId', v_authority_id,
    'retainerInvoiceId', v_retainer_invoice_id,
    'newlyExecuted', v_newly_executed
  );
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('app.proposal_accept_id', COALESCE(v_previous_accept, ''), true);
  PERFORM set_config('app.commercial_document_id', COALESCE(v_previous_commercial, ''), true);
  RAISE;
END;
$$;
-- ═══════════════════════════════════════════════════════════════════════════
-- PART 10 — public.issue_agreement_draw_invoice (P9, P13)
--
-- Read beside public.issue_trade_draw_invoice (head 00511:6130): every guard
-- here is that function's guard, said about a design-build draw.
--
-- THREE DELIBERATE DIFFERENCES, each with its reason:
--
--  (1) It calls public.issue_invoice(uuid, date) under the claim-adoption
--      sandwich (00423:2582-2589's shape), NOT
--      app_private.issue_invoice_for_actor. issue_invoice_for_actor anchors
--      every invoice line to a project_commercial_documents row
--      (00511:3841-3900) and a DEPOSIT draw is billed BEFORE countersign,
--      when no such row exists — so the anchor path could not work for it even
--      widened. public.issue_invoice (00412:2694) delegates to
--      _issue_invoice_pre_00412 and carries no anchor logic, which is exactly
--      why the draw rail is the caller it is written for.
--
--  (2) THE DEPOSIT IS BILLABLE AT client_signed (RC-7). The client's
--      obligation to fund the deposit arises from the client's OWN signature;
--      the studio countersigning is what starts the work. Every other draw
--      waits for 'executed' and a live billing authority. When the caller is
--      service_role and the draw is the deposit — the client-portal sign
--      route's own second, independently failable call (D-W3-2) — the
--      authorship check is skipped, because the client's signature IS the
--      authority for the client's own deposit. Everything else requires the
--      studio.
--
--  (3) A deposit minted before countersign has NO PROJECT, so the invoice is
--      anchored on its studio instead — 00571's first-class project-less
--      invoice. studio_id, client_id and designer_id are stamped because
--      set_invoice_studio_id's studio branch REQUIRES all three on a row with
--      no project (00571:247-264); on a project-bound draw the project path
--      resolves the studio exactly as it always has.
--
-- The offer never gates the signature: this function is not called from inside
-- the signature transaction at all, and a raise here leaves the signature
-- standing (R15).
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.issue_agreement_draw_invoice(
  p_proposal_id uuid,
  p_draw_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_active_role text := COALESCE(current_setting('role', true), 'none');
  v_proposal public.proposals%ROWTYPE;
  v_draw public.agreement_draw_invoices%ROWTYPE;
  v_document public.project_commercial_documents%ROWTYPE;
  v_project public.projects%ROWTYPE;
  v_studio_id uuid;
  v_invoice public.invoices%ROWTYPE;
  v_invoice_id uuid;
  v_unpaid integer;
  v_is_deposit boolean;
  v_client_authority boolean;
  v_pay_token text;
  v_previous_claims text := current_setting('request.jwt.claims', true);
  v_previous_commercial text :=
    current_setting('app.commercial_document_id', true);
BEGIN
  IF NULLIF(btrim(COALESCE(p_draw_key, '')), '') IS NULL THEN
    RAISE EXCEPTION 'design-build draw not found or access denied'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  v_is_deposit := btrim(p_draw_key) = 'deposit';
  -- The one caller that is not the studio: the client-portal sign route's
  -- service client, offering the client her own deposit the moment her
  -- signature commits.
  v_client_authority := v_is_deposit AND v_active_role = 'service_role';

  SELECT * INTO v_proposal FROM public.proposals
  WHERE id = p_proposal_id FOR UPDATE;
  -- Missing and denied answer identically, always: this RPC is granted to
  -- authenticated and must never confirm that a document exists.
  IF NOT FOUND
     OR v_proposal.document_kind <> 'design_build'
     OR NOT (
       v_client_authority
       OR (v_actor IS NOT NULL
           AND public._can_author_proposal(v_proposal.designer_id))
     )
  THEN
    RAISE EXCEPTION 'design-build draw not found or access denied'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_draw FROM public.agreement_draw_invoices
  WHERE proposal_id = p_proposal_id AND draw_key = btrim(p_draw_key)
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'design-build draw not found or access denied'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- The state gate (RC-7).
  IF v_is_deposit THEN
    IF v_proposal.commercial_state NOT IN ('client_signed', 'executed') THEN
      RAISE EXCEPTION 'the deposit is billable once the client has signed'
        USING ERRCODE = 'check_violation';
    END IF;
  ELSE
    IF v_proposal.commercial_state IS DISTINCT FROM 'executed' THEN
      RAISE EXCEPTION 'a draw is billable once the agreement is executed'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  SELECT * INTO v_document FROM public.project_commercial_documents
  WHERE proposal_id = p_proposal_id
  FOR UPDATE;

  IF v_document.project_id IS NOT NULL THEN
    SELECT * INTO v_project FROM public.projects
    WHERE id = v_document.project_id
    FOR UPDATE;
    v_studio_id := v_project.studio_id;
  END IF;

  IF NOT v_is_deposit THEN
    IF v_document.project_id IS NULL
       OR NOT EXISTS (
         SELECT 1 FROM public.project_billing_authorities a
         WHERE a.project_id = v_document.project_id
           AND a.status = 'active'
       )
    THEN
      RAISE EXCEPTION 'a draw is billable once the agreement is executed'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  -- Already billed? A VOIDED invoice frees the draw; a live one does not
  -- (00511:6304-6317, verbatim rule).
  IF v_draw.invoice_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.invoices invoice
    WHERE invoice.id = v_draw.invoice_id
      AND invoice.status <> 'void'
  ) THEN
    RAISE EXCEPTION 'the draw "%" is already billed on a live invoice', v_draw.label
      USING ERRCODE = 'check_violation';
  END IF;

  -- Every lower draw issued and paid in full.
  SELECT count(*) INTO v_unpaid
  FROM public.agreement_draw_invoices prior_draw
  LEFT JOIN public.invoices prior_invoice
    ON prior_invoice.id = prior_draw.invoice_id
  WHERE prior_draw.proposal_id = v_draw.proposal_id
    AND prior_draw.sort_order < v_draw.sort_order
    AND (
      prior_draw.invoice_id IS NULL
      OR prior_invoice.status IS DISTINCT FROM 'paid'
      OR prior_invoice.amount_paid_cents < prior_invoice.total_cents
    );
  IF v_unpaid > 0 THEN
    RAISE EXCEPTION 'earlier draws must be issued and paid before this one'
      USING ERRCODE = 'check_violation';
  END IF;

  -- The retainage release additionally waits for every work draw, not only
  -- the ones beneath it in the order.
  IF v_draw.is_retainage_release THEN
    SELECT count(*) INTO v_unpaid
    FROM public.agreement_draw_invoices work_draw
    LEFT JOIN public.invoices work_invoice
      ON work_invoice.id = work_draw.invoice_id
    WHERE work_draw.proposal_id = v_draw.proposal_id
      AND NOT work_draw.is_retainage_release
      AND (
        work_draw.invoice_id IS NULL
        OR work_invoice.status IS DISTINCT FROM 'paid'
        OR work_invoice.amount_paid_cents < work_invoice.total_cents
      );
    IF v_unpaid > 0 THEN
      RAISE EXCEPTION 'the retainage release waits until every draw is paid'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF v_studio_id IS NULL THEN
    v_studio_id := public._agreement_studio_id(
      p_proposal_id, COALESCE(v_actor, v_proposal.designer_id));
  END IF;
  IF v_studio_id IS NULL THEN
    SELECT identity.studio_id INTO v_studio_id
    FROM public.resolve_studio_identity(
      v_document.project_id, v_proposal.designer_id) AS identity;
  END IF;
  IF v_studio_id IS NULL THEN
    RAISE EXCEPTION 'this agreement does not sit in a studio that can bill it'
      USING ERRCODE = 'check_violation';
  END IF;

  -- total_cents is the NET: retainage is withheld, not billed.
  PERFORM set_config('app.commercial_document_id', p_proposal_id::text, true);
  INSERT INTO public.invoices (
    project_id, designer_id, client_id, studio_id, title, status, currency,
    subtotal_cents, tax_rate, tax_cents, total_cents, memo
  ) VALUES (
    v_document.project_id, v_proposal.designer_id, v_proposal.client_id,
    v_studio_id, v_draw.label, 'draft', 'USD',
    v_draw.net_cents, 0, 0, v_draw.net_cents,
    'Design-build draw · ' || v_draw.label
  ) RETURNING * INTO v_invoice;
  PERFORM set_config(
    'app.commercial_document_id', COALESCE(v_previous_commercial, ''), true);
  v_invoice_id := v_invoice.id;

  INSERT INTO public.invoice_line_items (
    invoice_id, kind, description, quantity, unit_amount_cents,
    amount_cents, metadata
  ) VALUES (
    v_invoice_id, 'adhoc', v_draw.label, 1,
    v_draw.net_cents, v_draw.net_cents,
    jsonb_build_object(
      'agreementProposalId', v_draw.proposal_id,
      'commercialDocumentId', v_document.id,
      'drawKey', v_draw.draw_key,
      'kind', 'agreement_draw',
      'grossCents', v_draw.gross_cents,
      'retainageCents', v_draw.retainage_cents)
  );

  -- issue_invoice authorizes against the invoice's owning designer through
  -- is_studio_comember, which reads auth.uid(). The studio caller is already
  -- proven above and the service_role deposit caller carries no uid at all, so
  -- the owner is adopted for the width of the issuance and restored
  -- immediately (00423:2582-2589's sandwich, kept verbatim in shape).
  PERFORM set_config('request.jwt.claims', jsonb_build_object(
    'sub', v_proposal.designer_id, 'role', 'authenticated'
  )::text, true);
  PERFORM public.issue_invoice(v_invoice_id, current_date);
  PERFORM set_config(
    'request.jwt.claims', COALESCE(v_previous_claims, ''), true);

  UPDATE public.agreement_draw_invoices
  SET invoice_id = v_invoice_id, issued_at = now(), updated_at = now()
  WHERE id = v_draw.id
  RETURNING * INTO v_draw;

  -- The deposit pointer has to follow a re-issue, or voiding a deposit invoice
  -- and re-issuing it leaves every deposit readout on the dead one
  -- (00423:2596-2615's reasoning, verbatim).
  IF v_is_deposit AND v_document.id IS NOT NULL THEN
    UPDATE public.project_commercial_documents
    SET deposit_invoice_id = v_invoice_id
    WHERE id = v_document.id;
  END IF;

  -- invoice_link_mint_on_issue (00574:143-149) has already fired inside this
  -- transaction, because issue_invoice UPDATEs status. A MISSING link is
  -- recoverable through ensure_invoice_link; an aborted issuance is not — so
  -- payToken comes back NULL rather than raising (00574:132-135's own rule).
  SELECT link.token INTO v_pay_token
  FROM public.invoice_links link
  WHERE link.invoice_id = v_invoice_id AND link.status = 'active'
  LIMIT 1;

  RETURN jsonb_build_object(
    'drawKey', v_draw.draw_key,
    'label', v_draw.label,
    'amountCents', v_draw.gross_cents,
    'retainageCents', v_draw.retainage_cents,
    'netCents', v_draw.net_cents,
    'invoiceId', v_invoice_id,
    'invoiceStatus', (
      SELECT invoice.status FROM public.invoices invoice
      WHERE invoice.id = v_invoice_id),
    'payToken', v_pay_token
  );
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config(
    'request.jwt.claims', COALESCE(v_previous_claims, ''), true);
  PERFORM set_config(
    'app.commercial_document_id', COALESCE(v_previous_commercial, ''), true);
  RAISE;
END;
$$;
COMMENT ON FUNCTION public.issue_agreement_draw_invoice(uuid, text) IS
  'Bills one design-build draw on the 00571 studio-invoice rail. The deposit is billable at client_signed, by the studio or by the sign route''s service client; every other draw waits for an executed agreement with a live billing authority. Retainage is withheld, not billed: the invoice carries net_cents.';
REVOKE ALL ON FUNCTION public.issue_agreement_draw_invoice(uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.issue_agreement_draw_invoice(uuid, text)
  TO authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- PART 11 — send_commercial_document: the design-build arm
-- 
-- The last door before a homeowner reads the paper, so every turnkey rule
-- is asked here whether or not the composer asked it: a pricing basis and a
-- draw schedule that validate, allowances that agree with their
-- schedule-of-values lines, one disclosure mode for the whole contract,
-- supervision paid once, a licensing attestation that has not lapsed since
-- the template was composed, no attachment naming a notice counsel has not
-- enabled, and a draw schedule that sums to the contract sum TO THE CENT —
-- the trade arm's own rule, applied to the new class.
-- 
-- On success the draw ledger is materialized from the now-frozen payload,
-- inside the same transaction. This is the ONLY writer of
-- agreement_draw_invoices.
-- ═══════════════════════════════════════════════════════════════════════════

-- Grafted VERBATIM from 00575_agreement_parts.sql:599-908, then the delta below.
CREATE OR REPLACE FUNCTION public.send_commercial_document(
  p_proposal_id uuid,
  p_expected_fingerprint text,
  p_personal_message text DEFAULT NULL,
  p_valid_until timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_proposal public.proposals%ROWTYPE;
  v_current_fingerprint text;
  v_dispatch_id uuid := extensions.gen_random_uuid();
  v_client_email text;
  v_client_name text;
  v_designer_name text;
  v_identity_name text;
  v_identity_logo text;
  v_identity_source text;
  v_sender_name text;
  v_studio_name text;
  v_studio_logo text;
  v_terms public.trade_scope_terms%ROWTYPE;
  v_draw_total bigint;
  v_allocation_total bigint;
  v_allocation_count integer;
  v_section_count integer;
  v_draw_count integer;
  v_gate_count integer;
  v_gate_sort integer;
  v_max_sort integer;
  v_first_gates boolean;
  v_percentage_count integer;
  v_percentage_total numeric;
  -- 00578
  v_pricing_basis jsonb;
  v_draws jsonb;
  v_allowances jsonb;
  v_contract_sum bigint;
  v_message text;
  v_disclosure text;
  v_draw_gross bigint;
  v_previous_send text := current_setting('app.proposal_send_id', true);
  v_previous_dispatch text := current_setting('app.proposal_send_dispatch_link', true);
BEGIN
  SELECT * INTO v_proposal FROM public.proposals
  WHERE id = p_proposal_id FOR UPDATE;
  IF NOT FOUND OR v_proposal.status <> 'draft' OR v_proposal.document_kind = 'legacy'
     OR NOT public._can_author_proposal(v_proposal.designer_id)
  THEN
    RAISE EXCEPTION 'commercial draft % not found or access denied', p_proposal_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  v_current_fingerprint := public._commercial_document_fingerprint(p_proposal_id);
  IF v_current_fingerprint IS DISTINCT FROM p_expected_fingerprint THEN
    RAISE EXCEPTION 'commercial document changed after review; refresh before sending'
      USING ERRCODE = 'serialization_failure';
  END IF;

  IF v_proposal.client_id IS NULL OR v_proposal.designer_client_id IS NULL
     OR NOT EXISTS (
       SELECT 1 FROM public.designer_clients dc
       WHERE dc.id = v_proposal.designer_client_id
         AND dc.designer_id = v_proposal.designer_id
         AND dc.client_id = v_proposal.client_id
     )
  THEN
    RAISE EXCEPTION 'commercial document requires an exact client relationship before sending'
      USING ERRCODE = 'check_violation';
  END IF;
  -- 00575: role rates are required only when the agreement bills time — a
  -- document with no parts (every pre-00575 and every flag-off document)
  -- still owes them, and so does one carrying a rate_card part. A composed
  -- flat-fee or retainer-only agreement owes none.
  IF v_proposal.document_kind IN ('design_services', 'service_addendum') AND (
    NOT EXISTS (SELECT 1 FROM public.proposal_service_terms t WHERE t.proposal_id = p_proposal_id)
    OR (public._agreement_requires_rate_card(p_proposal_id)
        AND NOT EXISTS (SELECT 1 FROM public.proposal_service_rates r WHERE r.proposal_id = p_proposal_id))
  ) THEN
    RAISE EXCEPTION 'design-services send requires terms, and role rates whenever a rate card is present'
      USING ERRCODE = 'check_violation';
  END IF;
  -- 00575: R4's floor is asked at the door too, not only where the parts were
  -- written. A composition can reach 'draft' by more than one road —
  -- materialize_standard_parts seeds from a terms row a co-member may have
  -- edited — so the last gate before the client sees the document asks again.
  IF v_proposal.document_kind IN ('design_services', 'service_addendum')
     AND public._agreement_floor_unmet(p_proposal_id) THEN
    RAISE EXCEPTION 'an agreement that bills time needs a ceiling'
      USING ERRCODE = 'check_violation';
  END IF;
  -- R22: and the fee half of the same floor, in the room's own sentence.
  IF v_proposal.document_kind IN ('design_services', 'service_addendum')
     AND public._agreement_fee_unnamed(p_proposal_id) THEN
    RAISE EXCEPTION 'This agreement names no fee. Add a rate card, a flat fee, or a per-phase fee.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_proposal.document_kind = 'furnishings_authorization' AND NOT EXISTS (
    SELECT 1 FROM public.project_commercial_documents d
    JOIN public.furnishing_authorization_items i ON i.commercial_document_id = d.id
    WHERE d.proposal_id = p_proposal_id
      AND EXISTS (SELECT 1 FROM public.project_budget_checkpoints c
        WHERE c.id = d.budget_checkpoint_id AND c.status IN ('acknowledged', 'overridden'))
  ) THEN
    RAISE EXCEPTION 'furnishings send requires a valid checkpoint and item snapshot'
      USING ERRCODE = 'check_violation';
  END IF;

  -- 00423: the trade arm. A scope is only a document when it says WHO does the
  -- work, WHAT the work is, WHAT it costs, and WHEN the client pays — and when
  -- the last two agree to the cent.
  IF v_proposal.document_kind = 'trade_scope' THEN
    SELECT * INTO v_terms FROM public.trade_scope_terms
    WHERE proposal_id = p_proposal_id;
    IF v_terms.proposal_id IS NULL OR v_terms.party_id IS NULL
       OR COALESCE(v_terms.client_price_cents, 0) <= 0 THEN
      RAISE EXCEPTION 'trade scope send requires a named party and a client price'
        USING ERRCODE = 'check_violation';
    END IF;

    SELECT count(*) INTO v_section_count FROM public.trade_scope_sections
    WHERE proposal_id = p_proposal_id;
    IF v_section_count = 0 THEN
      RAISE EXCEPTION 'trade scope send requires at least one scope section'
        USING ERRCODE = 'check_violation';
    END IF;

    SELECT count(*), COALESCE(sum(amount_cents), 0),
           count(*) FILTER (WHERE gates_on_acceptance),
           max(sort_order),
           max(sort_order) FILTER (WHERE gates_on_acceptance)
    INTO v_draw_count, v_draw_total, v_gate_count, v_max_sort, v_gate_sort
    FROM public.trade_scope_draws WHERE proposal_id = p_proposal_id;
    IF v_draw_count = 0 THEN
      RAISE EXCEPTION 'trade scope send requires at least one draw'
        USING ERRCODE = 'check_violation';
    END IF;
    IF v_draw_total IS DISTINCT FROM v_terms.client_price_cents::bigint THEN
      RAISE EXCEPTION 'trade scope draw schedule must sum to the client price'
        USING ERRCODE = 'check_violation';
    END IF;
    IF v_gate_count <> 1 THEN
      RAISE EXCEPTION 'trade scope draw schedule must have exactly one acceptance-gated draw'
        USING ERRCODE = 'check_violation';
    END IF;
    IF v_gate_sort IS DISTINCT FROM v_max_sort THEN
      RAISE EXCEPTION 'the acceptance-gated draw must be the last draw in the schedule'
        USING ERRCODE = 'check_violation';
    END IF;

    -- The one-gate and gate-is-last rules hold TRIVIALLY on a single-draw
    -- schedule: with one row, min sort_order = max sort_order, so a lone 100%
    -- "Final · on acceptance" draw satisfies every check above. Execution then
    -- bills the lowest-sort draw at signature — which would invoice the client
    -- the whole scope price the moment they sign, on the strength of a document
    -- that says the money is due on acceptance. The first draw is the deposit by
    -- construction, so it is the one draw that cannot gate. Same selector the
    -- execute rail uses (sort_order, id), so the two can never disagree about
    -- which draw is first.
    SELECT w.gates_on_acceptance INTO v_first_gates
    FROM public.trade_scope_draws w
    WHERE w.proposal_id = p_proposal_id
    ORDER BY w.sort_order, w.id LIMIT 1;
    IF COALESCE(v_first_gates, false) THEN
      RAISE EXCEPTION 'the first draw is billed at signature, so it must not be the acceptance-gated one'
        USING ERRCODE = 'check_violation';
    END IF;

    -- Percentage is display and amount_cents is the money, but a display figure
    -- that contradicts the money beside it is a second payment plan on the same
    -- page — and the client's document renders both. So when the studio states
    -- percentages at all, they must total 100 and each must describe its own
    -- amount. The tolerances are the honest ones: half a point for the total (a
    -- 33.3/33.3/33.4 schedule is a real schedule), and a dollar per line for the
    -- rounding an exact-cents split of an odd price forces.
    SELECT count(*) FILTER (WHERE w.percentage IS NOT NULL),
           COALESCE(sum(w.percentage), 0)
    INTO v_percentage_count, v_percentage_total
    FROM public.trade_scope_draws w WHERE w.proposal_id = p_proposal_id;
    IF v_percentage_count > 0 THEN
      IF abs(v_percentage_total - 100) > 0.5 THEN
        RAISE EXCEPTION 'trade scope draw percentages must total 100'
          USING ERRCODE = 'check_violation';
      END IF;
      IF EXISTS (
        SELECT 1 FROM public.trade_scope_draws w
        WHERE w.proposal_id = p_proposal_id AND w.percentage IS NOT NULL
          AND abs(round(v_terms.client_price_cents * w.percentage / 100.0)
                  - w.amount_cents) > 100
      ) THEN
        RAISE EXCEPTION 'each trade scope draw percentage must match the amount beside it'
          USING ERRCODE = 'check_violation';
      END IF;
    END IF;

    -- Allocations are optional as a SET. Once the studio starts apportioning the
    -- price across rooms, the apportionment must be complete and exact — a
    -- half-allocated scope tells the client a room costs $X and leaves the rest
    -- of the money unaccounted for.
    SELECT count(*) FILTER (WHERE allocation_cents IS NOT NULL),
           COALESCE(sum(allocation_cents), 0)
    INTO v_allocation_count, v_allocation_total
    FROM public.trade_scope_sections WHERE proposal_id = p_proposal_id;
    IF v_allocation_count > 0
       AND (v_allocation_count <> v_section_count
            OR v_allocation_total IS DISTINCT FROM v_terms.client_price_cents::bigint) THEN
      RAISE EXCEPTION 'trade scope section allocations must sum to the client price'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  -- ── 00578: the design-build arm (P9, P10, P11, R4, R11) ────────────────
  IF v_proposal.document_kind = 'design_build' THEN
    v_pricing_basis := public._agreement_design_build_part(
      p_proposal_id, 'pricing_basis');
    IF v_pricing_basis IS NULL THEN
      RAISE EXCEPTION 'a design-build agreement needs a pricing basis'
        USING ERRCODE = 'check_violation';
    END IF;
    v_message := public._validate_pricing_basis_payload(v_pricing_basis);
    IF v_message IS NOT NULL THEN
      RAISE EXCEPTION '%', v_message USING ERRCODE = 'check_violation';
    END IF;

    v_draws := public._agreement_design_build_part(p_proposal_id, 'draws');
    IF v_draws IS NULL THEN
      RAISE EXCEPTION 'a design-build agreement needs a draw schedule'
        USING ERRCODE = 'check_violation';
    END IF;
    v_message := public._validate_draws_payload(v_draws);
    IF v_message IS NOT NULL THEN
      RAISE EXCEPTION '%', v_message USING ERRCODE = 'check_violation';
    END IF;

    v_allowances := public._agreement_design_build_part(
      p_proposal_id, 'allowances');
    IF v_allowances IS NOT NULL THEN
      v_message := public._validate_allowances_payload(
        v_allowances, v_pricing_basis);
      IF v_message IS NOT NULL THEN
        RAISE EXCEPTION '%', v_message USING ERRCODE = 'check_violation';
      END IF;
    END IF;

    v_message := public._validate_no_double_count(
      public._agreement_parts_json(p_proposal_id));
    IF v_message IS NOT NULL THEN
      RAISE EXCEPTION '%', v_message USING ERRCODE = 'check_violation';
    END IF;

    -- One contract, one answer about how the trades are priced to the client
    -- (research 02 §9 item 5). It is authored on the sub-disclosure clause,
    -- where the composer's selector lives; the build sheet also allows it
    -- inside the pricing basis, so both are read and a DISAGREEMENT is
    -- refused rather than silently resolved.
    v_disclosure := public._agreement_sub_disclosure(p_proposal_id);
    IF v_disclosure = 'conflict' THEN
      RAISE EXCEPTION 'this agreement says the trades are priced open-book in one place and closed-book in another'
        USING ERRCODE = 'check_violation';
    END IF;
    IF v_disclosure IS NULL THEN
      RAISE EXCEPTION 'say whether the trades are priced open-book or closed-book'
        USING ERRCODE = 'check_violation';
    END IF;

    -- R43: under closed book the schedule of values is the studio's own, not
    -- derived from the cost lines — so there has to be one. Its arithmetic was
    -- already checked by _validate_pricing_basis_payload above; this is the
    -- door that asks for it at all.
    IF v_disclosure <> 'open_book'
       AND jsonb_array_length(
             public._agreement_schedule_of_values(
               v_pricing_basis, v_disclosure)) = 0 THEN
      RAISE EXCEPTION 'a closed-book agreement needs a schedule of values written for your client'
        USING ERRCODE = 'check_violation';
    END IF;

    -- R10: the gate holds at send too, not only at template selection. An
    -- attestation can lapse between composing and sending.
    IF NOT public.studio_has_live_license_attestation(
             public._agreement_studio_id(p_proposal_id, auth.uid())) THEN
      RAISE EXCEPTION 'the design-build template needs a current licensing attestation on file'
        USING ERRCODE = 'check_violation';
    END IF;

    -- R11: a notice counsel has not enabled never reaches a client's page,
    -- however the attachment part came to name it.
    IF EXISTS (
      SELECT 1
      FROM public.proposal_agreement_parts ap
      JOIN public.agreement_jurisdiction_notices notice
        ON notice.state = NULLIF(btrim(ap.payload->>'jurisdiction'), '')
      WHERE ap.proposal_id = p_proposal_id
        AND ap.kind = 'attachment'
        AND NOT notice.enabled
    ) THEN
      RAISE EXCEPTION 'that jurisdiction notice is held for counsel review and cannot be sent'
        USING ERRCODE = 'check_violation';
    END IF;

    v_contract_sum := public._agreement_contract_sum_cents(v_pricing_basis);
    SELECT COALESCE(sum(row.gross_cents), 0) INTO v_draw_gross
    FROM public._agreement_draw_rows(v_draws, v_contract_sum) AS row
    WHERE NOT row.is_retainage_release;
    IF v_draw_gross IS DISTINCT FROM v_contract_sum THEN
      RAISE EXCEPTION 'the draw schedule must come to the contract sum, to the cent'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  PERFORM 1 FROM public.proposal_service_terms
  WHERE proposal_id = p_proposal_id FOR UPDATE;
  PERFORM 1 FROM public.proposal_service_rates
  WHERE proposal_id = p_proposal_id ORDER BY id FOR UPDATE;
  PERFORM i.id FROM public.furnishing_authorization_items i
  JOIN public.project_commercial_documents d ON d.id = i.commercial_document_id
  WHERE d.proposal_id = p_proposal_id ORDER BY i.id FOR UPDATE OF i;
  PERFORM 1 FROM public.trade_scope_terms
  WHERE proposal_id = p_proposal_id FOR UPDATE;
  PERFORM 1 FROM public.trade_scope_sections
  WHERE proposal_id = p_proposal_id ORDER BY id FOR UPDATE;
  PERFORM 1 FROM public.trade_scope_draws
  WHERE proposal_id = p_proposal_id ORDER BY id FOR UPDATE;
  IF public._commercial_document_fingerprint(p_proposal_id)
     IS DISTINCT FROM p_expected_fingerprint THEN
    RAISE EXCEPTION 'commercial document changed while sending; refresh before sending'
      USING ERRCODE = 'serialization_failure';
  END IF;

  PERFORM set_config('app.proposal_send_id', p_proposal_id::text, true);
  UPDATE public.proposals SET
    status = 'sent', sent_at = now(),
    total_amount = CASE
      WHEN v_proposal.document_kind = 'trade_scope'
        THEN COALESCE(v_terms.client_price_cents, total_amount)
      -- 00578: the turnkey prime's total IS the contract sum the pricing
      -- basis names, so the send snapshot, the dispatch row and the client's
      -- bundle all report one number.
      WHEN v_proposal.document_kind = 'design_build'
        THEN COALESCE(v_contract_sum, total_amount)
      ELSE total_amount END,
    personal_message = COALESCE(p_personal_message, personal_message),
    valid_until = COALESCE(p_valid_until, valid_until), updated_at = now()
  WHERE id = p_proposal_id RETURNING * INTO v_proposal;
  PERFORM set_config('app.proposal_send_id', COALESCE(v_previous_send, ''), true);

  -- The UPDATE above writes hashed fields — total_amount for a trade scope, and
  -- valid_until / personal_message on every rail — so the fingerprint verified
  -- twice before the write is no longer the hash of the document that just left.
  -- Recompute, so what the caller is handed is what
  -- _commercial_document_fingerprint answers about this document now. (Nothing
  -- after this point touches a hashed column: proposal_send_dispatch_id, status,
  -- sent_at and updated_at are all outside _proposal_review_fingerprint.)
  v_current_fingerprint := public._commercial_document_fingerprint(p_proposal_id);

  -- 00578: the draw ledger, laid out from the now-frozen payload. Machine
  -- state, so it lands AFTER the fingerprint that records the authored
  -- document and changes nothing about it (RC-8). Re-send is impossible —
  -- the send door refuses a non-draft — so a plain INSERT is enough, and the
  -- ledger guard admits it because this body is SECURITY DEFINER owned by
  -- postgres.
  IF v_proposal.document_kind = 'design_build' THEN
    INSERT INTO public.agreement_draw_invoices (
      proposal_id, draw_key, sort_order, label,
      gross_cents, retainage_cents, net_cents, is_retainage_release
    )
    SELECT p_proposal_id, row.draw_key, row.sort_order, row.label,
           row.gross_cents, row.retainage_cents, row.net_cents,
           row.is_retainage_release
    FROM public._agreement_draw_rows(v_draws, v_contract_sum) AS row
    ORDER BY row.sort_order
    ON CONFLICT (proposal_id, draw_key) DO NOTHING;
  END IF;

  SELECT profile.email, profile.full_name INTO v_client_email, v_client_name
  FROM public.profiles profile WHERE profile.id = v_proposal.client_id;
  IF NULLIF(btrim(COALESCE(v_client_email, '')), '') IS NULL THEN
    RAISE EXCEPTION 'commercial document client must have an email before sending'
      USING ERRCODE = 'check_violation';
  END IF;
  SELECT COALESCE(profile.full_name, profile.display_name) INTO v_designer_name
  FROM public.profiles profile WHERE profile.id = v_proposal.designer_id;
  SELECT identity.name, identity.logo_url, identity.source
  INTO v_identity_name, v_identity_logo, v_identity_source
  FROM public.resolve_studio_identity(v_proposal.project_id, v_proposal.designer_id) identity;
  v_designer_name := COALESCE(NULLIF(btrim(v_designer_name), ''),
    NULLIF(btrim(v_identity_name), ''), 'Your designer');
  v_sender_name := COALESCE(NULLIF(btrim(v_identity_name), ''), v_designer_name);
  IF v_identity_source IN ('studio', 'business_name') THEN
    v_studio_name := NULLIF(btrim(v_identity_name), '');
    v_studio_logo := NULLIF(btrim(v_identity_logo), '');
  END IF;

  INSERT INTO public.proposal_send_dispatches (
    id, proposal_id, sent_at, designer_id, client_id, project_id,
    proposal_title, personal_message, valid_until, total_amount,
    recipient_email, recipient_name, designer_name, sender_name,
    studio_name, studio_logo_url, client_portal_path,
    provider_idempotency_key, email_log_id, in_app_log_id
  ) VALUES (
    v_dispatch_id, v_proposal.id, v_proposal.sent_at, v_proposal.designer_id,
    v_proposal.client_id, v_proposal.project_id, v_proposal.title,
    v_proposal.personal_message, v_proposal.valid_until, v_proposal.total_amount,
    v_client_email, v_client_name, v_designer_name, v_sender_name,
    v_studio_name, v_studio_logo, '/proposals/' || v_proposal.id::text,
    'proposal-send/' || v_dispatch_id::text,
    extensions.uuid_generate_v5('eb7b4041-796a-4c77-bd4d-817d2437917f'::uuid,
      'proposal-send/email/' || v_dispatch_id::text),
    extensions.uuid_generate_v5('eb7b4041-796a-4c77-bd4d-817d2437917f'::uuid,
      'proposal-send/in-app/' || v_dispatch_id::text)
  );
  PERFORM set_config('app.proposal_send_dispatch_link',
    v_proposal.id::text || ':' || v_dispatch_id::text, true);
  UPDATE public.proposals SET proposal_send_dispatch_id = v_dispatch_id
  WHERE id = v_proposal.id AND proposal_send_dispatch_id IS NULL
  RETURNING * INTO v_proposal;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'commercial document send dispatch link already exists'
      USING ERRCODE = 'check_violation';
  END IF;
  PERFORM set_config('app.proposal_send_dispatch_link', COALESCE(v_previous_dispatch, ''), true);

  RETURN jsonb_build_object(
    'proposalId', v_proposal.id,
    'documentKind', v_proposal.document_kind,
    'commercialState', 'sent',
    'status', v_proposal.status,
    'sentAt', v_proposal.sent_at,
    'proposalSendDispatchId', v_proposal.proposal_send_dispatch_id,
    'proposal_send_dispatch_id', v_proposal.proposal_send_dispatch_id,
    'updatedAt', v_proposal.updated_at,
    'documentFingerprint', v_current_fingerprint
  );
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('app.proposal_send_id', COALESCE(v_previous_send, ''), true);
  PERFORM set_config('app.proposal_send_dispatch_link', COALESCE(v_previous_dispatch, ''), true);
  RAISE;
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- PART 12 — get_client_commercial_document_bundle: the client's draw ledger
-- 
-- R13 IS ENFORCED HERE AND NOWHERE ELSE MATTERS.
-- 
-- `subs` projects IDENTITIES ALWAYS — who is doing the work in her house is
-- hers to know. `awardedPriceCents` is populated ONLY under open-book, and
-- is NULL under closed-book. The multi-bid comparison — trade_scope_bids,
-- which is studio-only by construction (00423:213), and every Trade
-- Agreement the studio holds beyond the one it awarded — is NEVER projected,
-- in either mode, at any state. A future widener has to argue with this
-- comment, which is the standard 00424:576-600 set for a DTO's absences.
-- 
-- The arm keys off v_proposal.document_kind, not v_document.document_kind:
-- the commercial-document row does not exist until countersign, and the
-- homeowner reads her draw schedule from the moment it is sent.
-- ═══════════════════════════════════════════════════════════════════════════

-- Grafted VERBATIM from 00577_agreement_fee_schedules.sql:2559-2841, then the delta below.
CREATE OR REPLACE FUNCTION public.get_client_commercial_document_bundle(p_proposal_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_proposal public.proposals%ROWTYPE;
  v_document public.project_commercial_documents%ROWTYPE;
BEGIN
  SELECT * INTO v_proposal FROM public.proposals WHERE id = p_proposal_id;
  IF NOT FOUND OR auth.uid() IS NULL OR NOT (
    v_proposal.client_id IS NOT DISTINCT FROM auth.uid()
    OR public.is_studio_comember(v_proposal.designer_id)
  ) THEN
    RAISE EXCEPTION 'commercial document % not found or access denied', p_proposal_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  -- A client never sees an unsent document. Legacy editions carry no
  -- commercial_state, so their draft-ness lives in status.
  --
  -- 00422: nor does a client see a document that was never ISSUED. Voiding
  -- writes commercial_state 'superseded' and deliberately leaves status alone,
  -- so a never-sent draft that the studio priced and thought better of used to
  -- pass the `= 'draft'` test the moment it was retired — the void itself
  -- published it. A terminal edition is client-visible only if it was sent.
  IF v_proposal.client_id IS NOT DISTINCT FROM auth.uid()
     AND (
       (v_proposal.document_kind = 'legacy' AND v_proposal.status = 'draft')
       OR (v_proposal.document_kind <> 'legacy'
           AND COALESCE(v_proposal.commercial_state, 'draft') = 'draft')
       OR (v_proposal.document_kind <> 'legacy'
           AND COALESCE(v_proposal.commercial_state, 'draft') IN ('superseded', 'declined')
           AND v_proposal.sent_at IS NULL)
     ) THEN
    RAISE EXCEPTION 'commercial document % not found or access denied', p_proposal_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- 00414: a legacy edition is not an error, it is a retired document.
  -- (B-8) The `parts` key is ALWAYS present, `[]` when the document has none
  -- (contract §2.4), including on this early-return — a reader that has to
  -- branch on the key's absence is a reader with two contracts.
  IF v_proposal.document_kind = 'legacy' THEN
    RETURN jsonb_build_object(
      'parts', '[]'::jsonb,
      -- (R25) A retired document is never composed. The key is present here
      -- for the same reason `parts` is: one contract, no branch on absence.
      'composed', false,
      'document', jsonb_build_object(
        'id', v_proposal.id,
        'documentKind', 'legacy',
        'kind', 'legacy',
        'retired', true,
        'title', v_proposal.title,
        'status', v_proposal.status,
        'commercialState', v_proposal.commercial_state,
        'supersededAt', v_proposal.superseded_at,
        'replacementProposalId', v_proposal.replacement_proposal_id,
        'validUntil', v_proposal.valid_until,
        'sentAt', v_proposal.sent_at
      )
    );
  END IF;

  SELECT * INTO v_document FROM public.project_commercial_documents
  WHERE proposal_id = p_proposal_id;

  RETURN jsonb_build_object(
    'document', jsonb_build_object(
      'id', v_proposal.id, 'projectId', COALESCE(v_document.project_id, v_proposal.project_id),
      'title', v_proposal.title, 'description', v_proposal.description,
      'documentKind', v_proposal.document_kind,
      'commercialState', v_proposal.commercial_state,
      'status', v_proposal.status, 'totalAmountCents', v_proposal.total_amount,
      'depositPercent', v_proposal.deposit_percent,
      'validUntil', v_proposal.valid_until, 'sentAt', v_proposal.sent_at,
      'sent_at', v_proposal.sent_at,
      'proposalSendDispatchId', v_proposal.proposal_send_dispatch_id,
      'proposal_send_dispatch_id', v_proposal.proposal_send_dispatch_id,
      'executedAt', v_document.executed_at,
      'supersededAt', v_proposal.superseded_at,
      'replacementProposalId', v_proposal.replacement_proposal_id,
      'createdAt', v_proposal.created_at, 'updatedAt', v_proposal.updated_at
    ),
    'serviceTerms', (SELECT jsonb_build_object(
      'scope', t.scope, 'deliverables', t.deliverables, 'exclusions', t.exclusions,
      'billingCeilingCents', t.billing_ceiling_cents,
      'retainerAmountCents', t.retainer_amount_cents,
      'retainerActivationPolicy', t.retainer_activation_policy,
      'billingCadence', t.billing_cadence, 'currency', t.currency,
      'terms', t.terms, 'currentRateVersion', t.current_rate_version,
      'furnishingsDepositPercent', t.furnishings_deposit_percent
    ) FROM public.proposal_service_terms t WHERE t.proposal_id = p_proposal_id),
    'rates', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'id', r.id, 'version', r.version, 'roleName', r.role_name,
      'hourlyRateCents', r.hourly_rate_cents, 'sortOrder', r.sort_order,
      'effectiveAt', r.effective_at
    ) ORDER BY r.version DESC, r.sort_order, r.role_name)
      FROM public.proposal_service_rates r WHERE r.proposal_id = p_proposal_id), '[]'::jsonb),
    -- 00575: the client's edge onto the parts. ENUMERATED keys, not
    -- to_jsonb — the same discipline the signature projection keeps below:
    -- source_template_key, source_part_id, client_visible and the
    -- timestamps stay behind. Only client_visible rows appear (R8), and
    -- the key is present and [] on every document, so the client adapter
    -- never branches on absence.
    'parts', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'id', ap.id, 'position', ap.position,
      'kind', ap.kind, 'variant', ap.variant,
      'partKey', ap.part_key, 'title', ap.title,
      -- 00578 (B3, R13, RC-4): on a turnkey prime the pricing basis crosses
      -- this edge REDACTED unless the sub-disclosure clause elected open book
      -- — the derived schedule of values in place of the trades at cost, the
      -- studio's fee and its markup. Every other part, and every other kind of
      -- document, crosses byte-for-byte as before.
      'payload', CASE WHEN v_proposal.document_kind = 'design_build'
        THEN public._agreement_redact_client_payload(
               ap.kind, ap.variant, ap.payload,
               public._agreement_sub_disclosure(p_proposal_id))
        ELSE ap.payload END,
      'required', ap.required
    ) ORDER BY ap.position, ap.id)
      FROM public.proposal_agreement_parts ap
      WHERE ap.proposal_id = p_proposal_id AND ap.client_visible), '[]'::jsonb),
    -- (R25) Whether this document is composed, said by the database rather
    -- than counted off the array above. The two are different questions: the
    -- array is filtered to client_visible, so an agreement whose every part
    -- the studio kept to itself arrives with `parts: []` and is STILL
    -- composed — and the homeowner must read the composition she was shown
    -- (nothing) rather than fall back to a terms row she was never shown.
    -- Read over EVERY part, visible or not.
    'composed', EXISTS (
      SELECT 1 FROM public.proposal_agreement_parts ap
      WHERE ap.proposal_id = p_proposal_id
    ),
    -- 00577 (R34): the one line the designer wrote about WHY this addendum
    -- exists. NULL on every other kind of document and on an addendum whose
    -- author wrote nothing; the whole of the change history stays behind (R8).
    'why', public._agreement_addendum_why(p_proposal_id),
    -- 00577 (P6): the sentence under the checkbox, composed by the database.
    -- The sign route reads it from HERE and never from the browser: a client
    -- that could post its own consent sentence could choose what it consented
    -- to. Recomputed at read time; the sentence she ACTUALLY ticked is frozen
    -- in the signature row's metadata, and that is what the record prints.
    'consentSentence', public.compose_agreement_consent(p_proposal_id),
    -- 00577 (R12): the frozen copy, NULL until countersign writes it. A
    -- pre-Wave-2 execution and an agreement with no parts both stay NULL and
    -- the keepsake renders exactly as it does today — no empty state, no
    -- "snapshot pending". part_set is deliberately NOT projected: the client
    -- reads the HTML she was given, not the studio's row shapes.
    'executionSnapshot', (
      SELECT jsonb_build_object(
        'html', snapshot.html,
        'documentHash', snapshot.document_hash,
        'createdAt', snapshot.created_at
      ) FROM public.agreement_execution_snapshots snapshot
      WHERE snapshot.proposal_id = p_proposal_id
    ),
    'signatures', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'id', s.id, 'partyRole', s.party_role,
      'signedName', s.signed_name, 'signedAt', s.signed_at,
      'evidenceFingerprint', s.evidence_fingerprint,
      -- 00425: the paper tell, projected as a BOOLEAN and nothing more. Raw
      -- metadata never crosses this edge — it carries recordedBy, which is a
      -- studio member's uuid, and the client has no business with it.
      'signedOnPaper', COALESCE((s.metadata->>'executedOnPaper')::boolean, false),
      -- 00425: THE DATE ON THE PAPER, and it is the one the client's copy must
      -- print as the signing date. signed_at is when the STUDIO wrote the act
      -- down, which on this rail is a different day — often weeks later — so a
      -- copy that renders signed_at as "SIGNED <date>" tells the client they
      -- signed on a day they did not. Projected as the bare yyyy-mm-dd text the
      -- studio typed (no timestamp, no zone: a calendar date has neither), and
      -- NULL on portal rows, which carry no such key because there the record
      -- moment IS the signing moment.
      'paperSignedOn', s.metadata->>'paperSignedOn',
      -- The scan pointer is projected ONLY when the folio row is flagged
      -- client_visible AND still anchored to THIS document. This body is
      -- SECURITY DEFINER, so project_documents RLS is not in force here; both
      -- facts have to be read explicitly or an unshared scan of the client's own
      -- signature page leaks its id, or a pointer at somebody else's folio row
      -- is handed to this client as if it were their signature page. The record
      -- rails validate the anchor at write time and the folio guard freezes it
      -- afterwards; this is the read edge saying so on its own authority rather
      -- than trusting two other seams to have held.
      'paperScanDocumentId', (
        SELECT scan.id FROM public.project_documents scan
        WHERE scan.id = (s.metadata->>'paperScanDocumentId')::uuid
          AND scan.proposal_id = p_proposal_id
          AND scan.client_visible
      ),
      -- 00577 (R36): THE SENTENCE SHE ACTUALLY TICKED, frozen with the act.
      -- Not compose_agreement_consent, which is recomputed from today's parts
      -- and would re-word a record every time an addendum moved something —
      -- the record must say what she agreed to, not what the paper says now.
      -- Projected as its own key, one scalar, in 00425's discipline: the
      -- signature's metadata carries recordedBy and other studio-side facts,
      -- and raw metadata never crosses this edge.
      'consentSentence', NULLIF(btrim(COALESCE(s.metadata->>'consentSentence', '')), '')
    ) ORDER BY s.signed_at, s.id) FROM public.commercial_document_signatures s
      WHERE s.proposal_id = p_proposal_id), '[]'::jsonb),
    'furnishings', CASE WHEN v_document.document_kind = 'furnishings_authorization'
      THEN jsonb_build_object(
        'documentId', v_document.id, 'waveName', v_document.wave_name,
        'proposalSendDispatchId', v_proposal.proposal_send_dispatch_id,
        'proposal_send_dispatch_id', v_proposal.proposal_send_dispatch_id,
        'sentAt', v_proposal.sent_at, 'sent_at', v_proposal.sent_at,
        'checkpointId', v_document.budget_checkpoint_id,
        'budgetCheckpointId', v_document.budget_checkpoint_id,
        'depositInvoiceId', v_document.deposit_invoice_id,
        'depositRequiredCents', COALESCE((SELECT i.total_cents
          FROM public.invoices i WHERE i.id = v_document.deposit_invoice_id),
          round(v_proposal.total_amount * v_proposal.deposit_percent / 100.0)::bigint),
        'deposit_required_cents', COALESCE((SELECT i.total_cents
          FROM public.invoices i WHERE i.id = v_document.deposit_invoice_id),
          round(v_proposal.total_amount * v_proposal.deposit_percent / 100.0)::bigint),
        'depositPaidCents', COALESCE((SELECT i.amount_paid_cents
          FROM public.invoices i WHERE i.id = v_document.deposit_invoice_id), 0),
        'deposit_paid_cents', COALESCE((SELECT i.amount_paid_cents
          FROM public.invoices i WHERE i.id = v_document.deposit_invoice_id), 0),
        'items', COALESCE((SELECT jsonb_agg(jsonb_build_object(
          'id', a.id, 'name', a.name, 'roomName', a.room_name,
          'category', a.category, 'itemType', a.item_type, 'quantity', a.quantity,
          'clientUnitPriceCents', a.client_unit_price_cents,
          'clientLineTotalCents', a.client_line_total_cents,
          'sourceFfeItemId', a.source_ffe_item_id, 'sortOrder', a.sort_order
        ) ORDER BY a.sort_order, a.id) FROM public.furnishing_authorization_items a
          WHERE a.commercial_document_id = v_document.id), '[]'::jsonb)
      ) ELSE NULL END,
    'replacement', (SELECT jsonb_build_object(
      'id', replacement.id, 'title', replacement.title,
      'documentKind', replacement.document_kind,
      'commercialState', replacement.commercial_state
    ) FROM public.proposals replacement WHERE replacement.id = v_proposal.replacement_proposal_id)
  ) || CASE WHEN v_document.document_kind = 'trade_scope'
      -- COALESCE, not a bare subquery: `object || NULL` is NULL in jsonb, so a
      -- scope somehow missing its terms row would blank the WHOLE bundle rather
      -- than one key. create_trade_scope always writes one; this is the belt.
      THEN COALESCE((SELECT jsonb_build_object('tradeScope', jsonb_build_object(
        'documentId', v_document.id,
        'sentAt', v_proposal.sent_at, 'sent_at', v_proposal.sent_at,
        'proposalSendDispatchId', v_proposal.proposal_send_dispatch_id,
        'proposal_send_dispatch_id', v_proposal.proposal_send_dispatch_id,
        'partyDisplayName', t.party_display_name,
        'partyCompanyName', t.party_company_name,
        'partyTrade', t.party_trade,
        'clientPriceCents', t.client_price_cents,
        'currency', t.currency,
        'terms', t.terms,
        'depositInvoiceId', v_document.deposit_invoice_id,
        'sections', COALESCE((SELECT jsonb_agg(jsonb_build_object(
          'id', s.id, 'roomId', s.project_room_id, 'roomName', s.room_name,
          'prose', s.prose, 'allocationCents', s.allocation_cents,
          'sortOrder', s.sort_order
        ) ORDER BY s.sort_order, s.id)
          FROM public.trade_scope_sections s WHERE s.proposal_id = p_proposal_id), '[]'::jsonb),
        'draws', COALESCE((SELECT jsonb_agg(jsonb_build_object(
          'id', w.id, 'label', w.label, 'percentage', w.percentage,
          'amountCents', w.amount_cents, 'sortOrder', w.sort_order,
          'gatesOnAcceptance', w.gates_on_acceptance,
          'invoiceId', w.invoice_id,
          'invoiceStatus', (SELECT i.status FROM public.invoices i WHERE i.id = w.invoice_id),
          'invoicePaidCents', (SELECT i.amount_paid_cents FROM public.invoices i WHERE i.id = w.invoice_id)
        ) ORDER BY w.sort_order, w.id)
          FROM public.trade_scope_draws w WHERE w.proposal_id = p_proposal_id), '[]'::jsonb),
        'progress', jsonb_build_object(
          'state', t.progress_state,
          'engagedAt', t.engaged_at,
          'substantialCompletionAt', t.substantial_completion_at,
          -- 00425: on a PAPER acceptance this IS the date on the paper —
          -- record_paper_trade_acceptance writes `accepted_at =
          -- p_paper_signed_on::timestamptz`, i.e. midnight UTC on the day the
          -- client signed, not the moment of typing. So the acceptance leg
          -- needs no paper-date twin the way signatures do; it needs its
          -- readers to format the DATE COMPONENT and not shift it west.
          'acceptedAt', t.accepted_at,
          'acceptedSignedName', t.accepted_signed_name,
          -- 00425: acceptance recorded from a printed copy says so, and carries
          -- the page — scoped exactly like the signature scan above: shared, and
          -- still anchored to this document.
          'acceptedOnPaper', t.accepted_on_paper,
          'acceptanceScanDocumentId', (
            SELECT scan.id FROM public.project_documents scan
            WHERE scan.id = t.acceptance_scan_document_id
              AND scan.proposal_id = p_proposal_id
              AND scan.client_visible
          )
        )
      )) FROM public.trade_scope_terms t WHERE t.proposal_id = p_proposal_id),
      '{}'::jsonb)
      ELSE '{}'::jsonb END
  || CASE WHEN v_proposal.document_kind = 'design_build'
      THEN jsonb_build_object('designBuild', jsonb_build_object(
        'documentId', v_document.id,
        'subDisclosure', public._agreement_sub_disclosure(p_proposal_id),
        'draws', COALESCE((SELECT jsonb_agg(jsonb_build_object(
          'drawKey', d.draw_key, 'label', d.label,
          'grossCents', d.gross_cents, 'retainageCents', d.retainage_cents,
          'netCents', d.net_cents,
          'isRetainageRelease', d.is_retainage_release,
          'invoiceStatus', (SELECT i.status FROM public.invoices i
                            WHERE i.id = d.invoice_id),
          'paidAt', (SELECT i.paid_at FROM public.invoices i
                     WHERE i.id = d.invoice_id),
          -- The waiver EXCHANGE, as a type and a date. Never the amount, the
          -- trade's own paper, or the storage path.
          'lienWaiver', (SELECT jsonb_build_object(
              'type', w.waiver_type, 'receivedAt', w.received_at)
            FROM public.agreement_draw_lien_waivers w
            WHERE w.draw_id = d.id AND w.received_at IS NOT NULL
            ORDER BY w.received_at DESC, w.created_at DESC LIMIT 1)
        ) ORDER BY d.sort_order, d.id)
          FROM public.agreement_draw_invoices d
          WHERE d.proposal_id = p_proposal_id), '[]'::jsonb),
        'retainageHeldCents', COALESCE((
          SELECT sum(d.retainage_cents)
          FROM public.agreement_draw_invoices d
          WHERE d.proposal_id = p_proposal_id
            AND NOT d.is_retainage_release
            AND d.invoice_id IS NOT NULL), 0),
        -- R13, and the reason it is one function call rather than a join:
        -- studio_trade_agreements is created by the NEXT migration, and this
        -- body must not name a table that does not exist yet — a failed
        -- 00579 would otherwise break the bundle for every client of every
        -- kind. _agreement_design_build_subs is a stub returning [] here and
        -- is re-headed in 00579 once the table exists.
        'subs', public._agreement_design_build_subs(
          p_proposal_id, public._agreement_sub_disclosure(p_proposal_id))
      ))
      ELSE '{}'::jsonb END;
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- PART 12b — compose_agreement_consent learns the turnkey class
-- 
-- FINDING F-W3-2, not in the build sheet. 00577's composer returns the
-- GENERIC fallback — 'I agree to the scope and investment in this
-- proposal.' — for any kind outside design_services and service_addendum,
-- and that sentence is exactly what the walk's step 12 names as the tell of
-- a missed branch. It is the sentence FROZEN INTO THE SIGNATURE ROW, so a
-- turnkey client would have kept a record of consenting to nothing in
-- particular.
-- 
-- The fragments are emitted in a canonical variant order independent of the
-- designer's part order, exactly as the services composer does, because
-- determinism across two implementations is the whole point: the TypeScript
-- twin is composeConsentLine in the client portal's consent-copy.ts and the
-- SQL test pins the same literals its jest test pins.
--
-- R40 (Wave 3 close-out): both halves compose from the CLIENT-VISIBLE
-- PROJECTION — client_visible parts, run through
-- _agreement_redact_client_payload — because that is the payload the door
-- renders beside the checkbox. Before this, the SQL half read the authored
-- row and the TS half read the bundle, and on a closed-book turnkey they
-- named different terms.
-- ═══════════════════════════════════════════════════════════════════════════

-- Grafted VERBATIM from 00577_agreement_fee_schedules.sql:752-897, then the delta below.
CREATE OR REPLACE FUNCTION public.compose_agreement_consent(p_proposal_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_kind text;
  v_designer_id uuid;
  v_client_id uuid;
  v_legacy text;
  v_part public.proposal_agreement_parts%ROWTYPE;
  v_fragments text[] := ARRAY[]::text[];
  v_items text[];
  v_list text;
  v_n integer;
  -- 00578
  v_basis jsonb;
  v_draws jsonb;
  v_allow jsonb;
  v_disclosure text;
  v_contract_sum bigint;
BEGIN
  SELECT p.document_kind, p.designer_id, p.client_id
  INTO v_kind, v_designer_id, v_client_id
  FROM public.proposals p WHERE p.id = p_proposal_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- 00511's posture: a SECURITY DEFINER function that reads one agreement asks
  -- who is asking. This one is granted to `authenticated` and composes a
  -- sentence out of that agreement's money parts, so without this block any
  -- signed-in stranger could read the fee shape of any studio's agreement by
  -- calling it with a proposal id. The predicate is
  -- get_client_commercial_document_bundle's own, character for character —
  -- never stricter, so the bundle's call (the only caller in the tree) passes
  -- for exactly the readers it already admitted.
  IF auth.uid() IS NULL OR NOT (
    v_client_id IS NOT DISTINCT FROM auth.uid()
    OR public.is_studio_comember(v_designer_id)
  ) THEN
    RAISE EXCEPTION 'commercial document % not found or access denied', p_proposal_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- consentLineFor(kind), character for character
  -- (apps/client-portal/src/components/threshold/consent-copy.ts:26-37).
  v_legacy := CASE
    WHEN v_kind = 'furnishings_authorization' THEN
      'I authorize the studio to procure only the named lines at the quantities and client prices shown. I understand any required deposit is a separate payment step.'
    WHEN v_kind = 'trade_scope' THEN
      'I authorize this trade to begin the work described, at the price shown. I understand the deposit draw is due on signature and each remaining draw is billed as the work reaches that stage.'
    WHEN v_kind IN ('design_services', 'service_addendum') THEN
      'I agree to these design-services terms and understand my signature alone does not authorize work until the studio countersigns.'
    WHEN v_kind = 'design_build' THEN
      'I agree to these design-build terms and understand my signature alone does not authorize work until the studio countersigns.'
    ELSE
      'I agree to the scope and investment in this proposal.'
  END;

  -- 00578 (F-W3-2): the turnkey sentence, composed from the money parts a
  -- turnkey prime actually carries. Canonical order — pricing basis, schedule
  -- of values, draws, retainage, allowances — never the designer's order.
  IF v_kind = 'design_build' THEN
    SELECT ap.payload INTO v_basis FROM public.proposal_agreement_parts ap
    WHERE ap.proposal_id = p_proposal_id AND ap.client_visible
      AND ap.kind = 'schedule' AND ap.variant = 'pricing_basis'
    ORDER BY ap.position, ap.id LIMIT 1;
    SELECT ap.payload INTO v_draws FROM public.proposal_agreement_parts ap
    WHERE ap.proposal_id = p_proposal_id AND ap.client_visible
      AND ap.kind = 'schedule' AND ap.variant = 'draws'
    ORDER BY ap.position, ap.id LIMIT 1;
    SELECT ap.payload INTO v_allow FROM public.proposal_agreement_parts ap
    WHERE ap.proposal_id = p_proposal_id AND ap.client_visible
      AND ap.kind = 'schedule' AND ap.variant = 'allowances'
    ORDER BY ap.position, ap.id LIMIT 1;

    -- R40: ONE SENTENCE, FROM WHAT SHE READS.
    --
    -- The client half composes from the bundle, and the bundle hands the
    -- homeowner a REDACTED pricing basis under anything but open book — no
    -- cost lines, no fee, no cost basis, and the derived schedule of values
    -- and contract sum in their place. Composing this half from the authored
    -- row would name a schedule of values her copy does not carry and, on a
    -- plain cost-plus basis, price a sentence off a cost basis she was never
    -- shown. So the redaction is applied here too, once, before a fragment is
    -- said: both halves read the same payload, and the sentence she ticks is
    -- the sentence frozen on her signature row.
    v_disclosure := public._agreement_sub_disclosure(p_proposal_id);
    v_basis := public._agreement_redact_client_payload(
      'schedule', 'pricing_basis', v_basis, v_disclosure);

    v_contract_sum := CASE
      WHEN public._agreement_is_int(v_basis->'contractSumCents')
        THEN (v_basis->>'contractSumCents')::bigint
      ELSE public._agreement_contract_sum_cents(v_basis)
    END;

    IF COALESCE(v_contract_sum, 0) > 0 THEN
      v_fragments := v_fragments || (CASE COALESCE(v_basis->>'basis', '')
        WHEN 'fixed'         THEN 'the fixed contract sum'
        WHEN 'cost_plus'     THEN 'the cost-plus pricing basis'
        WHEN 'cost_plus_gmp' THEN 'the cost-plus pricing basis and its guaranteed maximum price'
        WHEN 'tm_nte'        THEN 'the time-and-materials basis and its not-to-exceed amount'
        ELSE 'the pricing basis'
      END)::text;
      IF jsonb_typeof(v_basis->'scheduleOfValues') = 'array'
         AND jsonb_array_length(v_basis->'scheduleOfValues') > 0 THEN
        v_fragments := v_fragments || 'the schedule of values'::text;
      END IF;
    END IF;

    IF jsonb_typeof(COALESCE(v_draws->'draws', 'null'::jsonb)) = 'array'
       AND jsonb_array_length(v_draws->'draws') > 0 THEN
      v_fragments := v_fragments || 'the draw schedule'::text;
      IF jsonb_typeof(v_draws->'retainageBps') = 'number'
         AND (v_draws->>'retainageBps')::numeric > 0 THEN
        v_fragments := v_fragments || 'the retainage withheld from each draw'::text;
      END IF;
    END IF;

    IF jsonb_typeof(COALESCE(v_allow->'allowances', 'null'::jsonb)) = 'array'
       AND jsonb_array_length(v_allow->'allowances') > 0 THEN
      v_fragments := v_fragments || 'the allowances and what happens if they run over'::text;
    END IF;

    IF COALESCE(array_length(v_fragments, 1), 0) = 0 THEN
      RETURN v_legacy;
    END IF;

    v_items := ARRAY['these design-build terms']::text[] || v_fragments;
    v_n := array_length(v_items, 1);
    IF v_n = 1 THEN
      v_list := v_items[1];
    ELSIF v_n = 2 THEN
      v_list := v_items[1] || ' and ' || v_items[2];
    ELSE
      v_list := array_to_string(v_items[1:v_n - 1], ', ') || ', and ' || v_items[v_n];
    END IF;
    RETURN 'I agree to ' || v_list
      || ', and understand my signature alone does not authorize work until the studio countersigns.';
  END IF;

  -- W2 composes for services only.
  IF v_kind NOT IN ('design_services', 'service_addendum') THEN
    RETURN v_legacy;
  END IF;

  -- ONE PART PER MONEY VARIANT, and the sentence says its term once.
  --
  -- upsert_agreement_parts refuses a second rate card, ceiling, retainer or
  -- deposit outright (R18) and a second CLIENT-VISIBLE fee basis with it, so a
  -- set that reaches this loop carrying two of one variant cannot be composed
  -- through the RPC. The TS twin (`composeConsentLine`) reads one part per
  -- variant anyway — `money.find(...)` — and a LOOP over every row would say
  -- the fragment twice, in an order nothing pins, on the one input the two
  -- implementations could ever disagree about. DISTINCT ON makes the rule the
  -- composer's own: lowest `position` wins, which is the part the TS side's
  -- position-ordered array hands `find` first.
  FOR v_part IN
    SELECT one_per_variant.* FROM (
      SELECT DISTINCT ON (ap.variant) ap.*
      FROM public.proposal_agreement_parts ap
      WHERE ap.proposal_id = p_proposal_id
        AND ap.client_visible
        AND ap.kind = 'schedule'
        AND ap.variant IN ('rate_card', 'ceiling', 'flat', 'per_phase', 'retainer', 'procurement')
      ORDER BY ap.variant, ap.position, ap.id
    ) AS one_per_variant
    ORDER BY array_position(
      ARRAY['rate_card', 'ceiling', 'flat', 'per_phase', 'retainer', 'procurement']::text[],
      one_per_variant.variant)
  LOOP
    IF v_part.variant = 'rate_card' THEN
      IF jsonb_typeof(v_part.payload->'roles') = 'array'
         AND jsonb_array_length(v_part.payload->'roles') >= 1 THEN
        v_fragments := v_fragments || 'the signed role rates'::text;
      END IF;

    ELSIF v_part.variant = 'ceiling' THEN
      -- An UNSET ceiling is not a thing anyone consented to.
      IF jsonb_typeof(v_part.payload->'cents') = 'number'
         AND (v_part.payload->>'cents')::numeric > 0 THEN
        v_fragments := v_fragments || 'the design authorization ceiling'::text;
      END IF;

    ELSIF v_part.variant = 'flat' THEN
      v_fragments := v_fragments || 'the flat design fee'::text;

    ELSIF v_part.variant = 'per_phase' THEN
      IF jsonb_typeof(v_part.payload->'phases') = 'array'
         AND jsonb_array_length(v_part.payload->'phases') >= 1 THEN
        v_fragments := v_fragments || 'the per-phase fee schedule'::text;
      END IF;

    ELSIF v_part.variant = 'retainer' THEN
      IF jsonb_typeof(v_part.payload->'cents') = 'number'
         AND (v_part.payload->>'cents')::numeric > 0 THEN
        -- The ::text casts on every append are load-bearing: `text[] || 'x'`
        -- with an untyped literal is read as an array literal, and Postgres
        -- answers "malformed array literal" at run time, not at CREATE.
        v_fragments := v_fragments || (CASE
          COALESCE(NULLIF(btrim(COALESCE(v_part.payload->>'creditRule', '')), ''), 'credited')
          WHEN 'non_refundable' THEN 'the retainer, which is not refundable'
          WHEN 'replenishing'   THEN 'the replenishing retainer'
          ELSE 'the retainer credited against fees'
        END)::text;
      END IF;

    ELSIF v_part.variant = 'procurement' THEN
      IF jsonb_typeof(v_part.payload->'depositPercent') = 'number'
         AND (v_part.payload->>'depositPercent')::numeric > 0 THEN
        v_fragments := v_fragments || 'the furnishings deposit'::text;
      END IF;
    END IF;
  END LOOP;

  IF COALESCE(array_length(v_fragments, 1), 0) = 0 THEN
    RETURN v_legacy;
  END IF;

  v_items := ARRAY['these design-services terms']::text[] || v_fragments;
  v_n := array_length(v_items, 1);
  IF v_n = 1 THEN
    v_list := v_items[1];
  ELSIF v_n = 2 THEN
    v_list := v_items[1] || ' and ' || v_items[2];
  ELSE
    v_list := array_to_string(v_items[1:v_n - 1], ', ') || ', and ' || v_items[v_n];
  END IF;

  RETURN 'I agree to ' || v_list
    || ', and understand my signature alone does not authorize work until the studio countersigns.';
END;
$$;
-- ═══════════════════════════════════════════════════════════════════════════
-- PART 12c — _render_agreement_snapshot_html learns the turnkey paper
--
-- R12's keepsake is what the homeowner KEEPS: the page she signed, frozen at
-- countersign and read back from the bundle for the rest of the project's
-- life. 00577 wrote it for the nine-part design-services composition, and its
-- schedule CASE knows rate_card / per_phase / ceiling / flat / retainer /
-- cadence / procurement. A turnkey prime carries none of those. Left as it
-- was, the record of the largest money document in the system printed
--
--     Pricing basis   Recorded with your agreement.
--     Draw schedule   Recorded with your agreement.
--     Allowances      Recorded with your agreement.
--
-- — a keepsake with no sum, no draws and no retainage on it (B1) — and then
-- closed with "This agreement authorizes design services only…", which on a
-- construction contract is not a boundary but a false statement, frozen into
-- her durable record (B2).
--
-- So: three arms, and a boundary that knows what it is closing.
--
-- THE FIGURES ARE THE CLIENT BODY'S FIGURES. The pricing basis is redacted
-- through the same _agreement_redact_client_payload the bundle uses (B3), the
-- schedule of values is derived by the same _agreement_schedule_of_values, the
-- draws by the same _agreement_draw_rows the ledger was materialized from, and
-- every figure is formatted by _agreement_money_to_the_cent because a draw is
-- $23,978.19 and not $23,978. The two surfaces cannot drift because they are
-- one derivation.
--
-- WHAT THE KEEPSAKE DOES NOT CARRY: invoice status, paid dates and waiver
-- receipts. Those are machine state that moves for years after the signature,
-- and a frozen page that named them would be a page that lies a week later.
-- The live door shows them; the record shows the agreement.
--
-- Grafted VERBATIM from 00577_agreement_fee_schedules.sql:476-724, then the
-- deltas above.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public._render_agreement_snapshot_html(p_proposal_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  -- AGREEMENT_PART_COPY (packages/types/src/agreement-copy.ts), verbatim. The
  -- SQL test pins each of these against the same literal the client body
  -- imports; a sentence that moves in one place and not the other goes red.
  c_ceiling_uncapped  CONSTANT text :=
    'No ceiling — professional time is billed as it is worked.';
  c_retainer_on_payment CONSTANT text :=
    'Design work begins after the fully executed agreement and retainer payment.';
  c_retainer_on_execution CONSTANT text :=
    'Due under the terms of the fully executed agreement.';
  c_cadence_note CONSTANT text :=
    'Additional work requires written authorization before it can be invoiced.';
  c_recorded CONSTANT text := 'Recorded with your agreement.';
  c_not_yet_set CONSTANT text := 'Not yet set';
  c_attachment_ack CONSTANT text := 'I received this';
  -- R37 — AgreementPartsBody closes every composed body with this, always, and
  -- the copy she keeps is the page she signed. Losing it loses the one line
  -- that says what she did NOT authorize.
  c_boundary CONSTANT text :=
    'This agreement authorizes design services only. Furnishings, freight, tax, installation, and purchasing require a separate named furnishings authorization.';
  -- 00578 (B2) — and the turnkey paper's own, verbatim from
  -- design-build-body.tsx. A design-build agreement authorizes the work it
  -- names; what it holds back is the right to add to it without asking.
  c_boundary_turnkey CONSTANT text :=
    'This agreement covers the work described above, at the price shown. Anything added to it is a separate written change order before the work is done.';

  v_part public.proposal_agreement_parts%ROWTYPE;
  v_html text := '';
  v_body text;
  v_notes text;
  v_cents numeric;
  v_text text;
  v_why text;
  v_letter text;
  v_index integer := 0;
  -- 00578
  v_kind text;
  v_disclosure text;
  v_payload jsonb;
  v_sov jsonb;
  v_sum bigint;
  v_rows text;
  v_ret_total bigint;
  v_draw record;
BEGIN
  SELECT proposal.document_kind INTO v_kind
  FROM public.proposals proposal WHERE proposal.id = p_proposal_id;

  -- Resolved once for the page, exactly as the bundle resolves it. Anything
  -- that is not open_book closes the book, including a clause and a payload
  -- that disagree ('conflict') — fail closed on the homeowner's copy.
  IF v_kind = 'design_build' THEN
    v_disclosure := public._agreement_sub_disclosure(p_proposal_id);
  END IF;

  -- R34 — the change, and why it was made, in that order, exactly as the door
  -- prints them.
  v_why := public._agreement_addendum_why(p_proposal_id);
  IF v_why IS NOT NULL THEN
    v_html := '<p class="why">' || public._agreement_html_escape(v_why) || '</p>';
  END IF;

  -- R37 — the same three passes AgreementPartsBody makes, in the same order:
  -- the sections, the boundary that closes them, then the attachments as
  -- lettered leaves below both. An attestation is drawn nowhere at all, here
  -- exactly as there.
  FOR v_part IN
    SELECT ap.* FROM public.proposal_agreement_parts ap
    WHERE ap.proposal_id = p_proposal_id AND ap.client_visible
      AND ap.kind NOT IN ('attachment', 'attestation')
    ORDER BY ap.position, ap.id
  LOOP
    v_body := '';

    IF v_part.kind = 'clause' THEN
      -- R21 — an empty clause is nothing on the page, not a title over blank
      -- paper. The heading goes with it at the foot of this loop.
      v_text := NULLIF(btrim(COALESCE(v_part.payload->>'body', '')), '');
      IF v_text IS NOT NULL THEN
        v_body := '<p>' || replace(
          public._agreement_html_escape(v_part.payload->>'body'),
          E'\n', '<br>') || '</p>';
      END IF;

    ELSIF v_part.kind = 'list' THEN
      SELECT COALESCE(string_agg(
               '<li>' || public._agreement_html_escape(e.item->>'text') || '</li>', ''
               ORDER BY e.ord), '')
      INTO v_body
      FROM jsonb_array_elements(
             CASE WHEN jsonb_typeof(v_part.payload->'items') = 'array'
                  THEN v_part.payload->'items' ELSE '[]'::jsonb END)
        WITH ORDINALITY AS e(item, ord)
      WHERE NULLIF(btrim(COALESCE(e.item->>'text', '')), '') IS NOT NULL;
      v_body := CASE WHEN v_body = '' THEN '' ELSE '<ul>' || v_body || '</ul>' END;

    ELSIF v_part.kind = 'schedule' THEN
      IF v_part.variant = 'rate_card' THEN
        SELECT COALESCE(string_agg(
                 '<tr><td>' || public._agreement_html_escape(e.role->>'roleName')
                 || '</td><td>'
                 || CASE WHEN jsonb_typeof(e.role->'hourlyRateCents') = 'number'
                         THEN public._agreement_money((e.role->>'hourlyRateCents')::numeric)
                         ELSE c_not_yet_set END
                 -- RateCardLeaf prints "{money} / hr" (R37).
                 || ' / hr</td></tr>', ''
                 ORDER BY CASE WHEN jsonb_typeof(e.role->'sortOrder') = 'number'
                               THEN (e.role->>'sortOrder')::numeric
                               ELSE e.ord END, e.ord), '')
        INTO v_body
        FROM jsonb_array_elements(
               CASE WHEN jsonb_typeof(v_part.payload->'roles') = 'array'
                    THEN v_part.payload->'roles' ELSE '[]'::jsonb END)
          WITH ORDINALITY AS e(role, ord)
        WHERE NULLIF(btrim(COALESCE(e.role->>'roleName', '')), '') IS NOT NULL;
        -- A rate card with no readable role keeps its title and says it is on
        -- the paper, exactly as RateCardLeaf does.
        v_body := CASE WHEN v_body = '' THEN '<p>' || c_recorded || '</p>'
                       ELSE '<table>' || v_body || '</table>' END;

      ELSIF v_part.variant = 'per_phase' THEN
        SELECT COALESCE(string_agg(
                 '<tr><td>' || public._agreement_html_escape(e.phase->>'label')
                 || '</td><td>'
                 || CASE WHEN jsonb_typeof(e.phase->'cents') = 'number'
                         THEN public._agreement_money((e.phase->>'cents')::numeric)
                         ELSE '—' END
                 || '</td></tr>', '' ORDER BY e.ord), '')
        INTO v_body
        FROM jsonb_array_elements(
               CASE WHEN jsonb_typeof(v_part.payload->'phases') = 'array'
                    THEN v_part.payload->'phases' ELSE '[]'::jsonb END)
          WITH ORDINALITY AS e(phase, ord)
        WHERE NULLIF(btrim(COALESCE(e.phase->>'label', '')), '') IS NOT NULL;
        v_body := CASE WHEN v_body = '' THEN '<p>' || c_recorded || '</p>'
                       ELSE '<table>' || v_body || '</table>' END;

      ELSIF v_part.variant = 'ceiling' THEN
        -- Three states, and the middle one is why CeilingLeaf is the longest
        -- leaf in the client body: NO figure is a stated absence of a ceiling
        -- and says so in words (F-2), a zero is a figure nobody wrote (R21),
        -- and a written figure is the figure.
        IF jsonb_typeof(v_part.payload->'cents') IS DISTINCT FROM 'number' THEN
          v_body := '<p>' || c_ceiling_uncapped || '</p>';
        ELSIF (v_part.payload->>'cents')::numeric > 0 THEN
          v_body := '<p>' || public._agreement_money((v_part.payload->>'cents')::numeric) || '</p>';
        ELSE
          v_body := '<p>' || c_not_yet_set || '</p>';
        END IF;

      ELSIF v_part.variant IN ('flat', 'retainer') THEN
        IF jsonb_typeof(v_part.payload->'cents') IS DISTINCT FROM 'number' THEN
          v_body := '<p>' || c_recorded || '</p>';
        ELSE
          v_cents := (v_part.payload->>'cents')::numeric;
          IF v_cents > 0 THEN
            v_body := '<p>' || public._agreement_money(v_cents) || '</p>';
            IF v_part.variant = 'retainer' THEN
              -- The activation sentence, by policy — agreementRetainerActivation.
              -- The stored word itself is never printed: `non_refundable` is a
              -- value in a column, not something anyone reads.
              v_body := v_body || '<p>' || CASE
                WHEN v_part.payload->>'activationPolicy' = 'retainer_paid'
                THEN c_retainer_on_payment ELSE c_retainer_on_execution END || '</p>';
            END IF;
          ELSE
            -- Withheld with the figure: a clause about when a retainer is due,
            -- under no retainer, is a promise about nothing.
            v_body := '<p>' || c_not_yet_set || '</p>';
          END IF;
        END IF;

      ELSIF v_part.variant = 'cadence' THEN
        v_text := NULLIF(btrim(COALESCE(v_part.payload->>'cadence', '')), '');
        IF v_text IS NOT NULL THEN
          -- agreementCadenceText: the stored value, underscore opened up —
          -- and initcap for the `capitalize` treatment CadenceLeaf gives it,
          -- because the keepsake carries no stylesheet to do it (R37). The
          -- live body prints Monthly; so does this.
          v_body := '<p>' || public._agreement_html_escape(
                      initcap(replace(v_text, '_', ' '))) || '</p>';
        END IF;
        v_body := v_body || '<p>' || c_cadence_note || '</p>';

      ELSIF v_part.variant = 'procurement' THEN
        -- agreementDepositLine, and the three notes ProcurementLeaf prints
        -- beside it. R21 — `0% deposit` is an unwritten term, not a term.
        IF jsonb_typeof(v_part.payload->'depositPercent') = 'number'
           AND (v_part.payload->>'depositPercent')::numeric > 0 THEN
          v_body := '<p>' || public._agreement_html_escape(
            v_part.payload->>'depositPercent') || '% deposit</p>';
        END IF;
        SELECT COALESCE(string_agg(
                 '<dt>' || note.label || '</dt><dd>'
                 || public._agreement_html_escape(note.value) || '</dd>', ''
                 ORDER BY note.ord), '')
        INTO v_notes
        FROM (VALUES
                ('Markup basis', v_part.payload->>'markupBasis', 1),
                ('Freight and handling', v_part.payload->>'freightHandling', 2),
                ('Terms of sale', v_part.payload->>'termsOfSale', 3)
             ) AS note(label, value, ord)
        WHERE NULLIF(btrim(COALESCE(note.value, '')), '') IS NOT NULL;
        IF v_notes <> '' THEN
          v_body := v_body || '<dl>' || v_notes || '</dl>';
        END IF;
        -- Neither a deposit nor a note: the part takes its section with it,
        -- the way an empty clause does (R28, F2).

      ELSIF v_part.variant = 'pricing_basis' THEN
        -- 00578 (B1) — the turnkey prime's one fee part, and the sum the whole
        -- paper turns on. Redacted first, so what the record carries is what
        -- the page carried (B3).
        v_payload := public._agreement_redact_client_payload(
          v_part.kind, v_part.variant, v_part.payload, v_disclosure);

        -- BASIS_SENTENCE (design-build-body.tsx), verbatim.
        v_text := CASE v_payload->>'basis'
          WHEN 'fixed' THEN 'A fixed price for the whole of the work.'
          WHEN 'cost_plus' THEN
            'The cost of the work, plus the studio’s fee on it.'
          WHEN 'cost_plus_gmp' THEN
            'The cost of the work, plus the studio’s fee on it, and the total will not exceed the guaranteed maximum price below.'
          WHEN 'tm_nte' THEN
            'Time and materials as the work is done, and the total will not exceed the amount below.'
          ELSE NULL END;
        v_body := CASE WHEN v_text IS NULL THEN ''
                       ELSE '<p>' || public._agreement_html_escape(v_text)
                            || '</p>' END;

        -- The cost basis and the fee are OPEN-BOOK ROWS. Under closed book the
        -- redaction took them, and their absence here is the disclosure the
        -- clause elected — not a figure withheld by accident.
        v_notes := '';
        IF public._agreement_is_int(v_payload->'costBasisCents')
           AND (v_payload->>'costBasisCents')::bigint > 0 THEN
          v_notes := v_notes || '<dt>Cost basis</dt><dd>'
            || public._agreement_money_to_the_cent(
                 (v_payload->>'costBasisCents')::numeric) || '</dd>';
        END IF;
        IF public._agreement_is_int(v_payload->'feeBps')
           AND public._agreement_is_int(v_payload->'contractSumCents')
           AND public._agreement_is_int(v_payload->'costBasisCents')
           AND (v_payload->>'contractSumCents')::bigint
               - (v_payload->>'costBasisCents')::bigint > 0 THEN
          -- percentFromBps: 1800 is said as 18%, never as 18.00%.
          v_notes := v_notes || '<dt>Fee '
            || CASE WHEN (v_payload->>'feeBps')::bigint % 100 = 0
                    THEN ((v_payload->>'feeBps')::bigint / 100)::text
                    ELSE to_char((v_payload->>'feeBps')::numeric / 100.0,
                                 'FM990.00') END
            || '%</dt><dd>'
            || public._agreement_money_to_the_cent(
                 (v_payload->>'contractSumCents')::numeric
                 - (v_payload->>'costBasisCents')::numeric) || '</dd>';
        END IF;
        IF v_notes <> '' THEN
          v_body := v_body || '<dl>' || v_notes || '</dl>';
        END IF;

        -- BASIS_CEILING_LABEL, and R21 for the sum nobody has written yet.
        IF public._agreement_is_int(v_payload->'contractSumCents') THEN
          v_body := v_body || '<p class="ceiling-label">'
            || CASE v_payload->>'basis'
                 WHEN 'cost_plus_gmp' THEN 'Guaranteed maximum price'
                 WHEN 'tm_nte' THEN 'Not to exceed'
                 ELSE 'Contract price' END
            || '</p><p>' || public._agreement_money_to_the_cent(
                 (v_payload->>'contractSumCents')::numeric) || '</p>';
        ELSE
          v_body := v_body || '<p>' || c_not_yet_set || '</p>';
        END IF;

        -- The schedule of values, as its own section under the basis, exactly
        -- where ScheduleOfValuesLeaf draws it.
        v_sov := CASE WHEN jsonb_typeof(v_payload->'scheduleOfValues') = 'array'
                      THEN v_payload->'scheduleOfValues' ELSE '[]'::jsonb END;
        IF jsonb_array_length(v_sov) > 0 THEN
          SELECT COALESCE(string_agg(
                   '<tr><td>' || public._agreement_html_escape(e.line->>'label')
                   || '</td><td>' || public._agreement_money_to_the_cent(
                        (e.line->>'cents')::numeric) || '</td></tr>', ''
                   ORDER BY e.ord), ''),
                 COALESCE(sum((e.line->>'cents')::bigint), 0)
          INTO v_rows, v_sum
          FROM jsonb_array_elements(v_sov) WITH ORDINALITY AS e(line, ord);
          v_body := v_body || '<h2>Schedule of values</h2><table>' || v_rows
            || '<tr><td>Total</td><td>'
            || public._agreement_money_to_the_cent(v_sum::numeric)
            || '</td></tr></table>';
        END IF;

      ELSIF v_part.variant = 'draws' THEN
        -- 00578 (B1) — the same rows _agreement_draw_rows gave the ledger at
        -- send, derived again from the frozen payload rather than read out of
        -- the ledger: the keepsake is the schedule she agreed to, and it must
        -- not move when a draw is later billed, voided or re-issued.
        v_sum := public._agreement_contract_sum_cents(
          public._agreement_design_build_part(p_proposal_id, 'pricing_basis'));
        v_rows := '';
        v_ret_total := 0;
        FOR v_draw IN
          SELECT * FROM public._agreement_draw_rows(v_part.payload, v_sum)
          ORDER BY sort_order
        LOOP
          v_ret_total := v_ret_total + v_draw.retainage_cents;
          v_rows := v_rows || '<tr><td>'
            || public._agreement_html_escape(v_draw.label) || '</td><td>'
            || CASE WHEN v_draw.is_retainage_release THEN ''
                    ELSE public._agreement_money_to_the_cent(
                           v_draw.gross_cents::numeric) || ' of the price' END
            || CASE WHEN v_draw.retainage_cents > 0
                    THEN ' · ' || public._agreement_money_to_the_cent(
                           v_draw.retainage_cents::numeric) || ' held back'
                    ELSE '' END
            || '</td><td>' || public._agreement_money_to_the_cent(
                 v_draw.net_cents::numeric) || '</td></tr>';
        END LOOP;
        IF v_rows <> '' THEN
          v_body := '<table>' || v_rows || '</table>';
          IF v_ret_total > 0 THEN
            v_body := v_body || '<p>'
              || public._agreement_money_to_the_cent(v_ret_total::numeric)
              || ' is held back across the draws and released when the work is finished.</p>';
          END IF;
        END IF;
        -- No rows: R21 again. A draw schedule nobody has written yet takes its
        -- heading with it rather than standing over blank paper.

      ELSIF v_part.variant = 'allowances' THEN
        SELECT COALESCE(string_agg(
                 '<tr><td>' || public._agreement_html_escape(e.row->>'label')
                 || '</td><td>'
                 || CASE WHEN public._agreement_is_int(e.row->'amountCents')
                              AND (e.row->>'amountCents')::bigint > 0
                         THEN public._agreement_money_to_the_cent(
                                (e.row->>'amountCents')::numeric)
                         ELSE c_not_yet_set END
                 || '</td><td>'
                 || CASE WHEN e.row->>'overageRule' = 'client_credit'
                         THEN 'Anything over this amount is added to your account.'
                         ELSE 'Anything over this amount needs a change order first.' END
                 || CASE WHEN e.row->>'underageRule' = 'retain'
                         THEN ' Anything under it stays with the studio.'
                         ELSE ' Anything under it comes back to you.' END
                 || '</td></tr>', '' ORDER BY e.ord), '')
        INTO v_rows
        FROM jsonb_array_elements(
               CASE WHEN jsonb_typeof(v_part.payload->'allowances') = 'array'
                    THEN v_part.payload->'allowances' ELSE '[]'::jsonb END)
          WITH ORDINALITY AS e(row, ord)
        WHERE NULLIF(btrim(COALESCE(e.row->>'label', '')), '') IS NOT NULL;
        IF v_rows <> '' THEN
          v_body := '<table>' || v_rows || '</table>';
        END IF;

      ELSE
        -- The record-only variants (R9), and any variant a later wave adds to
        -- an agreement this build already froze. One line, the same line the
        -- page she signed printed for them. Never the payload's own keys.
        v_body := '<p>' || c_recorded || '</p>';
      END IF;

    ELSE
      -- Any other kind, including one a later wave writes. Its title, and one
      -- sentence — PartSection's own fallback.
      v_body := '<p>' || c_recorded || '</p>';
    END IF;

    IF v_body IS NOT NULL AND v_body <> '' THEN
      v_html := v_html || '<h2>' || public._agreement_html_escape(v_part.title)
                       || '</h2>' || v_body;
    END IF;
  END LOOP;

  -- 00578 (B2) — the boundary belongs to the class. A turnkey prime that closed
  -- with the services sentence would tell the homeowner, in her permanent
  -- record, that the construction contract she signed authorized no
  -- construction.
  v_html := v_html || '<p class="boundary">'
                   || public._agreement_html_escape(
                        CASE WHEN v_kind = 'design_build'
                             THEN c_boundary_turnkey ELSE c_boundary END)
                   || '</p>';

  -- An attachment is a rule across the page, not another section of it:
  -- AttachmentLeaf draws a line, then ATTACHMENT {letter} · {title}, then the
  -- body and the acknowledgment sentence if the part carries one. Unlike a
  -- clause it is drawn even when its body is empty — the eyebrow IS the leaf,
  -- and a notice with nothing typed under it is still a notice the paper
  -- names. The lettering is AgreementPartsBody's own: A..Z, then the ordinal.
  FOR v_part IN
    SELECT ap.* FROM public.proposal_agreement_parts ap
    WHERE ap.proposal_id = p_proposal_id AND ap.client_visible
      AND ap.kind = 'attachment'
    ORDER BY ap.position, ap.id
  LOOP
    v_letter := CASE WHEN v_index < 26 THEN chr(65 + v_index)
                     ELSE (v_index + 1)::text END;
    v_index := v_index + 1;

    v_html := v_html || '<hr>'
                     || '<p class="attachment-eyebrow">ATTACHMENT ' || v_letter
                     || ' · ' || public._agreement_html_escape(v_part.title)
                     || '</p>';
    v_text := NULLIF(btrim(COALESCE(v_part.payload->>'body', '')), '');
    IF v_text IS NOT NULL THEN
      v_html := v_html || '<p>' || replace(
        public._agreement_html_escape(v_part.payload->>'body'),
        E'\n', '<br>') || '</p>';
    END IF;
    IF (v_part.payload->'acknowledgeRequired') = 'true'::jsonb THEN
      v_html := v_html || '<p>'
                       || public._agreement_html_escape(c_attachment_ack) || '</p>';
    END IF;
  END LOOP;

  RETURN v_html;
END;
$$;
-- Re-issued verbatim from 00577:725-726. CREATE OR REPLACE preserves an ACL,
-- but Strata predates the 2026-05-30 grant flip and this is the one function
-- in this file whose body the homeowner's record is made of.
REVOKE ALL ON FUNCTION public._render_agreement_snapshot_html(uuid)
  FROM PUBLIC, anon, authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- PART 13 — patina.design_build, the tenth seeded Template
--
-- The Library's fourth seeded row, in 00576 PART 9's shape and under its
-- immutability guard (seeded rows refuse UPDATE and DELETE to every caller,
-- service_role included, unless a migration sets
-- app.allow_patina_template_mutation).
--
-- R28 GOVERNS EVERY MONEY FIGURE HERE, as it does the other three: nothing the
-- designer did not type prints as a term. The pricing basis, the draw list,
-- the allowances, the supervision fee and the disclosure mode all seed UNSET,
-- and the composed page prints "Not yet set" until she states them. The one
-- exception is retainage, seeded at 5% for exactly the reason R28-as-amended
-- calls a billing cadence chosen: the editor shows 5% preselected on every
-- road in (research 02 §3 — 5 to 10%, trending 5), and the designer saves it.
--
-- The tenth rail part is NOT the attestation. patina.licensing_attestation is
-- a STUDIO-level record read from studio_license_attestations at compose time,
-- never a row in this rail and never client-visible — it is the gate, not a
-- part of the paper.
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO public.agreement_templates (
  template_key, kind, studio_id, class, title, parts, created_by
) VALUES (
  'patina.design_build', 'seeded', NULL, 'design_build',
  'Design-build turnkey',
  jsonb_build_array(
    jsonb_build_object(
      'partKey', 'patina.pricing_basis', 'kind', 'schedule',
      'variant', 'pricing_basis',
      'title', 'Pricing basis', 'required', true, 'clientVisible', true,
      'payload', jsonb_build_object(
        'basis', NULL, 'costLines', '[]'::jsonb, 'costBasisCents', NULL,
        'scheduleOfValues', '[]'::jsonb)),
    jsonb_build_object(
      'partKey', 'patina.draws', 'kind', 'schedule', 'variant', 'draws',
      'title', 'Draw schedule', 'required', true, 'clientVisible', true,
      'payload', jsonb_build_object(
        'draws', '[]'::jsonb, 'retainageBps', 500)),
    jsonb_build_object(
      'partKey', 'patina.allowances', 'kind', 'schedule',
      'variant', 'allowances',
      'title', 'Allowances', 'required', false, 'clientVisible', true,
      'payload', jsonb_build_object('allowances', '[]'::jsonb)),
    jsonb_build_object(
      'partKey', 'patina.sub_disclosure', 'kind', 'clause', 'variant', NULL,
      'title', 'Who does the work', 'required', true, 'clientVisible', true,
      'payload', jsonb_build_object(
        'mode', NULL,
        'body', 'The studio engages and directs the trades named in this agreement and remains responsible for their work.')),
    jsonb_build_object(
      'partKey', 'patina.supervision_fee', 'kind', 'clause', 'variant', NULL,
      'title', 'Supervision', 'required', true, 'clientVisible', true,
      'payload', jsonb_build_object(
        'body', 'The studio supervises the trades, coordinates the sequence of work, and answers for the result.')),
    jsonb_build_object(
      'partKey', 'patina.change_orders', 'kind', 'clause', 'variant', NULL,
      'title', 'Change orders', 'required', true, 'clientVisible', true,
      'payload', jsonb_build_object(
        'body', 'A change to the scope, the schedule or the sum is agreed in writing before the work is done, and is recorded against this agreement.')),
    jsonb_build_object(
      'partKey', 'patina.termination', 'kind', 'clause', 'variant', NULL,
      'title', 'Termination', 'required', true, 'clientVisible', true,
      'payload', jsonb_build_object(
        'body', 'Either party may end this engagement in writing. Work performed and materials ordered to that date remain payable.')),
    jsonb_build_object(
      'partKey', 'patina.terms', 'kind', 'clause', 'variant', NULL,
      'title', 'Terms', 'required', true, 'clientVisible', true,
      'payload', jsonb_build_object('body', '')),
    jsonb_build_object(
      'partKey', 'patina.notice_of_cancellation', 'kind', 'attachment',
      'variant', NULL,
      'title', 'Notice of cancellation', 'required', false,
      'clientVisible', true,
      'payload', jsonb_build_object(
        'title', 'Notice of cancellation', 'body', '',
        'jurisdiction', NULL, 'acknowledgeRequired', true)),
    jsonb_build_object(
      'partKey', 'patina.lien_waiver_form', 'kind', 'attachment',
      'variant', NULL,
      'title', 'Lien waiver form', 'required', false, 'clientVisible', true,
      'payload', jsonb_build_object(
        'title', 'Lien waiver form',
        'body', 'Each trade exchanges a conditional waiver when a draw is requested and an unconditional waiver once that draw is paid. The final draw is released against unconditional final waivers.',
        'acknowledgeRequired', true)),
    -- THE ELEVENTH ENTRY IS NOT AN ELEVENTH PART (R16). The flow-down clause
    -- is the wording that binds a trade to the terms the studio owes the
    -- homeowner, and counsel has not read it. It ships the way the six
    -- jurisdiction notices ship: SEEDED AND DARK. `enabled: false` is what
    -- materialize_agreement_template refuses to compose, so the rail still
    -- lays out ten parts and this body reaches no agreement, no homeowner and
    -- no trade — while existing, in one place, for counsel to review.
    --
    -- studio_trade_agreements.flow_down_clause_key is the column that would
    -- name it (00579 PART 1); it stays NULL, and create_trade_agreement
    -- REFUSES a payload that tries to set it rather than ignoring it. Turning
    -- this on is one migration flipping one boolean — and nothing else.
    jsonb_build_object(
      'partKey', 'patina.flow_down', 'kind', 'clause', 'variant', NULL,
      'title', 'Flow-down', 'required', false, 'clientVisible', false,
      'enabled', false,
      'payload', jsonb_build_object(
        'body', 'The trade is bound to the studio by the same obligations the studio owes the homeowner under the prime agreement, so far as they apply to the trade''s own scope of work. Where the two disagree, the prime agreement governs, and the studio tells the trade in writing which of its terms apply before the work begins.'))
  ),
  NULL
) ON CONFLICT (template_key) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════
-- PART 14 — close
-- 
-- Every function above that is new carries its own REVOKE/GRANT pair beside
-- it; every function that was REDEFINED keeps the ACL it already had, which
-- CREATE OR REPLACE preserves — so no hardened grant is re-issued here and
-- none can be accidentally widened. Strata predates the 2026-05-30 grant
-- flip and auto-grants anon EXECUTE at creation, which is why
-- platform_acl_compatibility_test.sql asserts every new function
-- anon-denied BY NAME (SQL-T12).
-- 
-- This file adds GRANT/REVOKE, so seed/00-legacy-grants.sql is regenerated
-- after it with python3 scripts/generate-legacy-grants.py.
-- ═══════════════════════════════════════════════════════════════════════════

COMMIT;
