-- ═══════════════════════════════════════════════════════════════════════════
-- 00577 — Fee schedules, the change history, and the copy she keeps
--
-- Wave 2: P5 (fee schedules), P6 (the client's copy from parts + the execution
-- snapshot, R12), P7 (addenda composed from parts), P8 (change history).
--
-- R9 draws the line this file enforces IN THE PROJECTION, not in the room:
-- rate_card, ceiling, retainer, cadence, flat and per_phase create billing
-- authority, and procurement does for its deposit percent alone. Everything
-- else a schedule can be — percent_of_cost, percent_of_spend, cost_plus,
-- day_rate, package, pricing_basis, draws, allowances — is RECORDED on the
-- agreement and reaches the money row not at all. A hand-made cost_plus part
-- written straight through the RPC must leave fee_basis NULL, which is why
-- the rule lives here and not only behind a chip.
--
-- Lineage of every function redefined here (grep|sort|tail-1 winners,
-- re-verified against supabase/migrations at authoring time — note that Wave
-- 1 RE-HEADED four of these five, so 00575 is the body grafted from, not the
-- older number the Wave 2 build sheet remembered):
--   upsert_agreement_parts                      00575:2623
--   _sign_design_services_agreement_authorized   00412:767  → 00575:915
--   _countersign_design_services_agreement_impl  00566:304  → 00575:1302
--   get_client_commercial_document_bundle        00425:1214 → 00575:3393
--   sign_design_services_agreement_with_trusted_ip            00511:1825
--   _commercial_document_fingerprint  00412:704 → 00422:251 → 00423:1214
--                                                            → 00575:503
--
-- OVERLOAD HAZARD, and how it is answered. Adding a defaulted argument to a
-- plpgsql function CREATES A NEW OVERLOAD; the old one survives and PostgREST
-- then has two candidates for the same call. Each widened function is
-- DROPped at its old arity first, and its REVOKE/GRANT pair re-issued after —
-- a DROP takes the ACL with it.
--
-- R31 then puts each old arity BACK, as a thin wrapper that delegates to the
-- wide body with the new argument NULL, carrying the same ACL the migration
-- that hardened it wrote. A hardened arity is a name other things hold: five
-- live plpgsql callers hold the four-argument
-- _sign_design_services_agreement_authorized, the sign route holds the
-- four-argument sign_design_services_agreement_with_trusted_ip, the Wave 1
-- hook holds the two-argument upsert_agreement_parts — and 00511's
-- seventeen-function REVOKE, replayed by seed/00-legacy-grants.sql, holds the
-- fourth. Because both arities exist, the WIDE bodies carry no defaults: a
-- default on the wide body beside a narrow one of the same name is the exact
-- ambiguity the DROPs above were written to avoid. Every call has one
-- candidate; no signature anything already holds has moved.
--
-- WHAT THIS FILE DOES NOT DO:
--   · It adds NO new caller of app_private.issue_invoice_for_actor. The
--     hardening contract test asserts the caller universe exhaustively
--     (public_sd_hardening_contract_test.sql), and draw invoicing is Wave 3.
--   · It does not widen billing_cadence with 'per_draw'. Wave 3.
--   · It adds neither of its two new TABLES to the fingerprint: the change
--     history is the studio's own log, and the execution snapshot is written
--     AFTER the fingerprint it records.
--   · It does not redefine create_service_addendum. P7 composes the
--     addendum's part set AFTER that RPC returns, through
--     copy_agreement_parts_from_authority below.
--   · It does not extend the countersign's idempotent-retry branch to compare
--     consent. A retry keeps the first signature row, exactly as it does now.
--
-- IT DOES, HOWEVER, HAVE TO TOUCH _commercial_document_fingerprint, and an
-- earlier draft of this banner said the opposite. The fingerprint hashes
-- proposal_service_terms as `to_jsonb(t) - created_at - updated_at`
-- (00575:512-515), so "a new COLUMN is covered automatically" is true in the
-- wrong direction: adding the four columns below changes the digest of EVERY
-- existing services document, and _countersign_design_services_agreement_impl
-- refuses with 23514 when the stored client signature's evidence_fingerprint
-- disagrees. Every agreement sitting in client_signed at push time would
-- become permanently uncountersignable, and no flag covers it —
-- `agreement-library` gates UI, not schema. So PART 1b re-issues the
-- fingerprint with the serviceTerms leg made conditional in exactly the shape
-- Wave 1 used for `parts`: at their pre-W2 values the four keys are dropped
-- from the hashed object, and a document that has not written a fee schedule
-- hashes precisely what it hashed before this file ran. The moment one of
-- them carries a value, all four ride in the digest and a stale signature is
-- correctly refused. Existing signature rows cannot be repaired — the table
-- is immutable — which is why the compatibility has to live in the hash.
--
-- Every new SECURITY DEFINER pins `search_path = public, pg_temp` (or with
-- `extensions` where it mints a uuid or digests), the posture of the
-- surrounding commercial family. Extension functions are schema-qualified —
-- the prod push session's search_path lacks `extensions` (the 00282 incident).
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════
-- PART 1 — Four columns, on the projection and on the authority it becomes
--
-- proposal_service_terms is what an agreement says about money; countersign
-- snapshots it into project_billing_authorities, and the two rows have to be
-- able to say the same things. So both learn the same four columns in the
-- same file — a column added to one alone is an agreement whose fee basis
-- stops existing the moment it executes.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.proposal_service_terms
  ADD COLUMN IF NOT EXISTS retainer_credit_rule text NOT NULL DEFAULT 'credited';
ALTER TABLE public.proposal_service_terms
  ADD COLUMN IF NOT EXISTS fee_basis text;
ALTER TABLE public.proposal_service_terms
  ADD COLUMN IF NOT EXISTS fee_amount_cents integer;
ALTER TABLE public.proposal_service_terms
  ADD COLUMN IF NOT EXISTS fee_schedule jsonb;

ALTER TABLE public.proposal_service_terms
  DROP CONSTRAINT IF EXISTS proposal_service_terms_retainer_credit_rule_check;
ALTER TABLE public.proposal_service_terms
  ADD CONSTRAINT proposal_service_terms_retainer_credit_rule_check
  CHECK (retainer_credit_rule IN ('credited', 'non_refundable', 'replenishing'));
ALTER TABLE public.proposal_service_terms
  DROP CONSTRAINT IF EXISTS proposal_service_terms_fee_basis_check;
ALTER TABLE public.proposal_service_terms
  ADD CONSTRAINT proposal_service_terms_fee_basis_check
  CHECK (fee_basis IS NULL OR fee_basis IN ('hourly', 'flat', 'per_phase'));
ALTER TABLE public.proposal_service_terms
  DROP CONSTRAINT IF EXISTS proposal_service_terms_fee_amount_cents_check;
ALTER TABLE public.proposal_service_terms
  ADD CONSTRAINT proposal_service_terms_fee_amount_cents_check
  CHECK (fee_amount_cents IS NULL OR fee_amount_cents >= 0);
ALTER TABLE public.proposal_service_terms
  DROP CONSTRAINT IF EXISTS proposal_service_terms_fee_schedule_check;
ALTER TABLE public.proposal_service_terms
  ADD CONSTRAINT proposal_service_terms_fee_schedule_check
  CHECK (fee_schedule IS NULL OR jsonb_typeof(fee_schedule) = 'array');

ALTER TABLE public.project_billing_authorities
  ADD COLUMN IF NOT EXISTS retainer_credit_rule text NOT NULL DEFAULT 'credited';
ALTER TABLE public.project_billing_authorities
  ADD COLUMN IF NOT EXISTS fee_basis text;
ALTER TABLE public.project_billing_authorities
  ADD COLUMN IF NOT EXISTS fee_amount_cents integer;
ALTER TABLE public.project_billing_authorities
  ADD COLUMN IF NOT EXISTS fee_schedule jsonb;

ALTER TABLE public.project_billing_authorities
  DROP CONSTRAINT IF EXISTS project_billing_authorities_retainer_credit_rule_check;
ALTER TABLE public.project_billing_authorities
  ADD CONSTRAINT project_billing_authorities_retainer_credit_rule_check
  CHECK (retainer_credit_rule IN ('credited', 'non_refundable', 'replenishing'));
ALTER TABLE public.project_billing_authorities
  DROP CONSTRAINT IF EXISTS project_billing_authorities_fee_basis_check;
ALTER TABLE public.project_billing_authorities
  ADD CONSTRAINT project_billing_authorities_fee_basis_check
  CHECK (fee_basis IS NULL OR fee_basis IN ('hourly', 'flat', 'per_phase'));
ALTER TABLE public.project_billing_authorities
  DROP CONSTRAINT IF EXISTS project_billing_authorities_fee_amount_cents_check;
ALTER TABLE public.project_billing_authorities
  ADD CONSTRAINT project_billing_authorities_fee_amount_cents_check
  CHECK (fee_amount_cents IS NULL OR fee_amount_cents >= 0);
ALTER TABLE public.project_billing_authorities
  DROP CONSTRAINT IF EXISTS project_billing_authorities_fee_schedule_check;
ALTER TABLE public.project_billing_authorities
  ADD CONSTRAINT project_billing_authorities_fee_schedule_check
  CHECK (fee_schedule IS NULL OR jsonb_typeof(fee_schedule) = 'array');

-- ═══════════════════════════════════════════════════════════════════════════
-- PART 1b — The fingerprint keeps its word to every document already signed
--
-- 00575:503 body VERBATIM. The delta is the serviceTerms leg alone: the four
-- columns added directly above are dropped from the hashed object while they
-- stand at their pre-W2 values (fee_basis, fee_amount_cents and fee_schedule
-- NULL; retainer_credit_rule 'credited', the column's own DEFAULT). This is
-- the same conditional shape Wave 1 gave `parts`, and for the same reason:
-- an unconditional key changes the digest of every legacy document, and
-- _countersign_design_services_agreement_impl raises 23514 when the stored
-- client signature's evidence_fingerprint disagrees with the current one.
-- A homeowner who signed yesterday must still be able to have her studio
-- countersign tomorrow; her signature row is immutable, so the hash is the
-- only place that promise can be kept.
--
-- It is NOT a hole in the instrument. The moment a designer writes a fee
-- basis, an amount or a schedule — the whole point of P5 — all four keys
-- enter the digest, the fingerprint moves, and a signature taken against the
-- older paper is refused exactly as it should be.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public._commercial_document_fingerprint(p_proposal_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
  SELECT encode(extensions.digest(convert_to((jsonb_build_object(
    'proposal', public._proposal_review_fingerprint(p_proposal_id),
    'documentKind', p.document_kind,
    'serviceTerms', (
      SELECT CASE
        WHEN t.fee_basis IS NULL
         AND t.fee_amount_cents IS NULL
         AND t.fee_schedule IS NULL
         AND t.retainer_credit_rule IS NOT DISTINCT FROM 'credited'
        THEN to_jsonb(t) - 'created_at' - 'updated_at'
               - 'fee_basis' - 'fee_amount_cents' - 'fee_schedule'
               - 'retainer_credit_rule'
        ELSE to_jsonb(t) - 'created_at' - 'updated_at'
      END
      FROM public.proposal_service_terms t WHERE t.proposal_id = p.id
    ),
    'serviceRates', COALESCE((
      SELECT jsonb_agg(to_jsonb(r) - 'id' - 'created_at' ORDER BY r.version, r.sort_order, r.role_name)
      FROM public.proposal_service_rates r WHERE r.proposal_id = p.id
    ), '[]'::jsonb),
    'furnishings', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'sourceProposalItemId', i.source_proposal_item_id,
        'sourceFfeItemId', i.source_ffe_item_id,
        'projectRoomId', i.project_room_id,
        'productId', i.product_id, 'name', i.name, 'roomName', i.room_name,
        'category', i.category, 'itemType', i.item_type, 'quantity', i.quantity,
        'clientUnitPriceCents', i.client_unit_price_cents,
        'clientLineTotalCents', i.client_line_total_cents,
        'snapshot', i.snapshot, 'sortOrder', i.sort_order
      ) ORDER BY i.sort_order, i.id)
      FROM public.furnishing_authorization_items i
      JOIN public.project_commercial_documents d ON d.id = i.commercial_document_id
      WHERE d.proposal_id = p.id
    ), '[]'::jsonb)
  ) || CASE WHEN p.document_kind = 'trade_scope' THEN jsonb_build_object(
    'tradeScope', jsonb_build_object(
      'partyId', (SELECT t.party_id FROM public.trade_scope_terms t WHERE t.proposal_id = p.id),
      'partyDisplayName', (SELECT t.party_display_name FROM public.trade_scope_terms t WHERE t.proposal_id = p.id),
      'partyCompanyName', (SELECT t.party_company_name FROM public.trade_scope_terms t WHERE t.proposal_id = p.id),
      'partyTrade', (SELECT t.party_trade FROM public.trade_scope_terms t WHERE t.proposal_id = p.id),
      'clientPriceCents', (SELECT t.client_price_cents FROM public.trade_scope_terms t WHERE t.proposal_id = p.id),
      'currency', (SELECT t.currency FROM public.trade_scope_terms t WHERE t.proposal_id = p.id),
      'terms', (SELECT t.terms FROM public.trade_scope_terms t WHERE t.proposal_id = p.id),
      'sections', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'roomName', s.room_name, 'projectRoomId', s.project_room_id,
          'prose', s.prose, 'allocationCents', s.allocation_cents,
          'sortOrder', s.sort_order
        ) ORDER BY s.sort_order, s.id)
        FROM public.trade_scope_sections s WHERE s.proposal_id = p.id
      ), '[]'::jsonb),
      'draws', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'label', w.label, 'percentage', w.percentage,
          'amountCents', w.amount_cents, 'sortOrder', w.sort_order,
          'gatesOnAcceptance', w.gates_on_acceptance
        ) ORDER BY w.sort_order, w.id)
        FROM public.trade_scope_draws w WHERE w.proposal_id = p.id
      ), '[]'::jsonb)
    )
  ) ELSE '{}'::jsonb END
    -- 00575: parts join the hash the moment a document HAS parts, and not
    -- one moment sooner. CONDITIONAL, not unconditional: an unconditional
    -- key changes the digest of every legacy document, and countersign
    -- refuses when the stored client signature's evidence_fingerprint
    -- disagrees (00566:628-631). A parts-less document must hash exactly
    -- what it hashed before this migration, or every in-flight
    -- client_signed agreement dies. ALL parts are hashed, not only
    -- client-visible ones: the send guard freezes the whole set, and a
    -- studio-only part is still part of the instrument the two parties are
    -- bound by. to_jsonb(ap) minus the timestamps means a new column on
    -- that table is covered automatically, the same property serviceTerms
    -- has. The alias is `ap`, because the outer alias is already `p`.
    || CASE WHEN EXISTS (
         SELECT 1 FROM public.proposal_agreement_parts ap WHERE ap.proposal_id = p.id
       ) THEN jsonb_build_object(
    'parts', (
      SELECT jsonb_agg(to_jsonb(ap) - 'created_at' - 'updated_at'
                       ORDER BY ap.position, ap.id)
      FROM public.proposal_agreement_parts ap WHERE ap.proposal_id = p.id
    )
  ) ELSE '{}'::jsonb END)::text, 'UTF8'), 'sha256'), 'hex')
  FROM public.proposals p
  WHERE p.id = p_proposal_id;
$$;
REVOKE ALL ON FUNCTION public._commercial_document_fingerprint(uuid)
  FROM PUBLIC, anon, authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- PART 2 — The change history (P8)
--
-- Studio-only. The homeowner reads the agreement, not the studio's revision
-- log (R8), so this table never reaches the client's bundle and carries no
-- client policy at all. Append-only through guard_commercial_immutable_row:
-- a history that can be edited is not a history.
--
-- `before` and `after` are unreserved keywords in Postgres and legal as bare
-- column names. They are the brief's words; they stay.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.agreement_part_events (
  id          uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  proposal_id uuid NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
  part_id     uuid,
  part_key    text NOT NULL,
  action      text NOT NULL CHECK (action IN (
                'added', 'edited', 'removed', 'reordered', 'renamed', 'materialized')),
  actor       uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  actor_name  text CHECK (actor_name IS NULL
                          OR char_length(btrim(actor_name)) BETWEEN 1 AND 120),
  why         text CHECK (why IS NULL
                          OR char_length(btrim(why)) BETWEEN 1 AND 200),
  before      jsonb,
  after       jsonb,
  at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agreement_part_events_proposal
  ON public.agreement_part_events (proposal_id, at DESC);

ALTER TABLE public.agreement_part_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS agreement_part_events_studio_read ON public.agreement_part_events;
CREATE POLICY agreement_part_events_studio_read
ON public.agreement_part_events FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.proposals p
  WHERE p.id = agreement_part_events.proposal_id
    AND public.is_studio_comember(p.designer_id)
));

-- No write policy: rows are written only by definer RPCs.
-- guard_commercial_immutable_row (00412:603-616), not
-- guard_commercial_authored_child — an event is written AFTER draft too, when
-- an addendum carries its why.
DROP TRIGGER IF EXISTS guard_agreement_part_events_immutable ON public.agreement_part_events;
CREATE TRIGGER guard_agreement_part_events_immutable
  BEFORE UPDATE OR DELETE ON public.agreement_part_events
  FOR EACH ROW EXECUTE FUNCTION public.guard_commercial_immutable_row();

REVOKE ALL ON TABLE public.agreement_part_events FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.agreement_part_events TO authenticated;
GRANT ALL ON TABLE public.agreement_part_events TO service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- PART 3 — The copy she keeps (R12, P6)
--
-- One frozen HTML snapshot per agreement, composed server-side at execution
-- from the parts the homeowner could actually read, and never re-rendered on
-- read. No PDF. The client never SELECTs this table — the bundle projects it,
-- and the bundle is SECURITY DEFINER, exactly as it already reads
-- commercial_document_signatures.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.agreement_execution_snapshots (
  proposal_id   uuid PRIMARY KEY REFERENCES public.proposals(id) ON DELETE CASCADE,
  html          text NOT NULL,
  part_set      jsonb NOT NULL CHECK (jsonb_typeof(part_set) = 'array'),
  document_hash text NOT NULL CHECK (char_length(document_hash) = 64),
  created_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.agreement_execution_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS agreement_execution_snapshots_studio_read
  ON public.agreement_execution_snapshots;
CREATE POLICY agreement_execution_snapshots_studio_read
ON public.agreement_execution_snapshots FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.proposals p
  WHERE p.id = agreement_execution_snapshots.proposal_id
    AND public.is_studio_comember(p.designer_id)
));

DROP TRIGGER IF EXISTS guard_agreement_execution_snapshots_immutable
  ON public.agreement_execution_snapshots;
CREATE TRIGGER guard_agreement_execution_snapshots_immutable
  BEFORE UPDATE OR DELETE ON public.agreement_execution_snapshots
  FOR EACH ROW EXECUTE FUNCTION public.guard_commercial_immutable_row();

REVOKE ALL ON TABLE public.agreement_execution_snapshots FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.agreement_execution_snapshots TO authenticated;
GRANT ALL ON TABLE public.agreement_execution_snapshots TO service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- PART 4 — The renderer
--
-- Server-side HTML, no CSS and no script — the keepsake styles it. Every
-- interpolated string is escaped, because a clause body is whatever the
-- designer typed and this string is stored and later injected into a page.
--
-- R12 + R27 — THIS IS THE PAGE SHE SIGNED, FROZEN. Not a third rendering of
-- the parts with its own opinions: leaf for leaf it says what
-- apps/client-portal/src/components/agreement-parts-body.tsx said on the
-- night she ticked the box. Every sentence that is not the document's own
-- words is AGREEMENT_PART_COPY (packages/types/src/agreement-copy.ts),
-- duplicated below as SQL literals and pinned by
-- supabase/tests/commercial/agreement_fee_schedules_test.sql the same way the
-- consent sentence is pinned against composeConsentLine. If the TypeScript
-- moves and this does not, that suite goes red.
--
-- DEPARTS DELIBERATELY FROM BUILD SHEET §3.3's renderer sketch, which had a
-- record-only schedule and an attestation printed as their raw payload keys
-- and values. That prints `dayRateCents 250000` and `non_refundable` onto the
-- homeowner's permanent copy: a database column name and a raw enum, both
-- forbidden in anything she reads, and a figure in raw cents beside figures
-- that are formatted. A record-only variant says the one line the page she
-- signed said for it; an attestation is not drawn at all, because the client
-- body never draws one (a studio's licence is between the studio and its
-- state).
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public._agreement_html_escape(p_value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT replace(replace(replace(replace(
    COALESCE(p_value, ''), '&', '&amp;'), '<', '&lt;'), '>', '&gt;'), '"', '&quot;');
$$;
REVOKE ALL ON FUNCTION public._agreement_html_escape(text)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public._agreement_money(p_cents numeric)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT CASE WHEN p_cents IS NULL THEN 'Not yet set'
              ELSE '$' || to_char(p_cents / 100.0, 'FM999,999,990.00') END;
$$;
REVOKE ALL ON FUNCTION public._agreement_money(numeric)
  FROM PUBLIC, anon, authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- R34 — THE ADDENDUM'S WHY IS THE HOMEOWNER'S TO READ.
--
-- The `why` is the one line the designer writes when she composes an addendum,
-- and the sheet she writes it in has always told her the client reads it
-- beside the change. It did not: the events table was studio-only, and the
-- bundle projected no such key — a promise made in the one place W2 asks her
-- to write something for the homeowner, and not kept.
--
-- One line per addendum, not one per part: copy_agreement_parts_from_authority
-- writes the same why onto every event it logs, so printing it per part would
-- repeat one sentence down the page. The FIRST why the addendum recorded is
-- the one it was created with; a later save's why is a studio note about a
-- studio edit, and the homeowner is reading the paper, not the log.
--
-- Nothing else about agreement_part_events crosses the edge — not the actor,
-- not the before/after payloads, not the action. R8 still holds for the log
-- itself; this is one sentence, lifted out deliberately.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public._agreement_addendum_why(p_proposal_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT NULLIF(btrim(event.why), '')
  FROM public.agreement_part_events AS event
  JOIN public.proposals AS proposal ON proposal.id = event.proposal_id
  WHERE event.proposal_id = p_proposal_id
    AND proposal.document_kind = 'service_addendum'
    AND NULLIF(btrim(COALESCE(event.why, '')), '') IS NOT NULL
  ORDER BY event.at, event.id
  LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public._agreement_addendum_why(uuid)
  FROM PUBLIC, anon, authenticated, service_role;

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

  v_part public.proposal_agreement_parts%ROWTYPE;
  v_html text := '';
  v_body text;
  v_notes text;
  v_cents numeric;
  v_text text;
  v_why text;
BEGIN
  -- R34 — the change, and why it was made, in that order, exactly as the door
  -- prints them.
  v_why := public._agreement_addendum_why(p_proposal_id);
  IF v_why IS NOT NULL THEN
    v_html := '<p class="why">' || public._agreement_html_escape(v_why) || '</p>';
  END IF;

  FOR v_part IN
    SELECT ap.* FROM public.proposal_agreement_parts ap
    WHERE ap.proposal_id = p_proposal_id AND ap.client_visible
    ORDER BY ap.position, ap.id
  LOOP
    -- An attestation reaches the homeowner as nothing at all, here exactly as
    -- in the body she read: AgreementPartsBody filters `kind === 'attestation'`
    -- out before it draws a single section.
    CONTINUE WHEN v_part.kind = 'attestation';

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

    ELSIF v_part.kind = 'attachment' THEN
      v_body := '<article class="leaf">';
      v_text := NULLIF(btrim(COALESCE(v_part.payload->>'body', '')), '');
      IF v_text IS NOT NULL THEN
        v_body := v_body || '<p>' || replace(
          public._agreement_html_escape(v_part.payload->>'body'),
          E'\n', '<br>') || '</p>';
      END IF;
      IF (v_part.payload->'acknowledgeRequired') = 'true'::jsonb THEN
        v_body := v_body || '<p>' || public._agreement_html_escape(c_attachment_ack) || '</p>';
      END IF;
      v_body := v_body || '</article>';

    ELSIF v_part.kind = 'schedule' THEN
      IF v_part.variant = 'rate_card' THEN
        SELECT COALESCE(string_agg(
                 '<tr><td>' || public._agreement_html_escape(e.role->>'roleName')
                 || '</td><td>'
                 || CASE WHEN jsonb_typeof(e.role->'hourlyRateCents') = 'number'
                         THEN public._agreement_money((e.role->>'hourlyRateCents')::numeric)
                         ELSE c_not_yet_set END
                 || ' per hour</td></tr>', ''
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
          -- agreementCadenceText: the stored value, underscore opened up.
          v_body := '<p>' || public._agreement_html_escape(replace(v_text, '_', ' ')) || '</p>';
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

  RETURN v_html;
END;
$$;
REVOKE ALL ON FUNCTION public._render_agreement_snapshot_html(uuid)
  FROM PUBLIC, anon, authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- PART 5 — The composed consent sentence (P6)
--
-- TWO IMPLEMENTATIONS OF ONE SENTENCE, and this is the one the signature row
-- records. The other is composeConsentLine in the client portal's
-- consent-copy.ts, which is what the homeowner reads under the checkbox.
-- Their agreement is not a hope: the SQL test reproduces the same literals the
-- TypeScript test pins, and either one moving turns the other red.
--
-- Fragments are emitted in a CANONICAL VARIANT ORDER that is independent of
-- the designer's part order — rate_card, ceiling, flat, per_phase, retainer,
-- procurement — because determinism across two implementations is the whole
-- point, and the designer's order is not a thing either of them can see the
-- same way. Only CLIENT-VISIBLE schedule parts contribute (R8): a fee the
-- studio kept to itself is not a fee she is consenting to. A cadence
-- contributes nothing — it is when invoices go out, not an authorization —
-- and every other variant contributes nothing in W2 (R9).
--
-- ZERO FRAGMENTS, OR NO PARTS AT ALL, RETURNS THE LEGACY LITERAL VERBATIM, so
-- the flag-off and pre-composition paths say exactly what the door has always
-- said. Note that the legacy literal has no comma before "and understand";
-- the composed form does. That is correct and intended.
-- ═══════════════════════════════════════════════════════════════════════════

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
    ELSE
      'I agree to the scope and investment in this proposal.'
  END;

  -- W2 composes for services only.
  IF v_kind NOT IN ('design_services', 'service_addendum') THEN
    RETURN v_legacy;
  END IF;

  FOR v_part IN
    SELECT ap.* FROM public.proposal_agreement_parts ap
    WHERE ap.proposal_id = p_proposal_id
      AND ap.client_visible
      AND ap.kind = 'schedule'
      AND ap.variant IN ('rate_card', 'ceiling', 'flat', 'per_phase', 'retainer', 'procurement')
    ORDER BY array_position(
      ARRAY['rate_card', 'ceiling', 'flat', 'per_phase', 'retainer', 'procurement']::text[],
      ap.variant)
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
REVOKE ALL ON FUNCTION public.compose_agreement_consent(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.compose_agreement_consent(uuid)
  TO authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- PART 6 — The change-history writer
--
-- Called from inside upsert_agreement_parts, with the part set as it stood
-- BEFORE the write and as it stands after. A no-op save writes nothing, so a
-- room that autosaves does not fill the strip with silence.
--
-- The attribution rule is 00569:432-452's, verbatim in effect: the first
-- whitespace-separated token of the profile's full_name, else display_name,
-- truncated at 120 rather than raised on — a person's name is not a reason to
-- refuse a save. actor_name is NULL whenever why is NULL, because an
-- attribution with nothing attributed to it is noise.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public._log_agreement_part_events(
  p_proposal_id uuid,
  p_before jsonb,
  p_after jsonb,
  p_why text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_why text := NULLIF(btrim(COALESCE(p_why, '')), '');
  v_actor_name text;
BEGIN
  IF v_why IS NOT NULL THEN
    SELECT COALESCE(
             NULLIF(
               split_part(
                 regexp_replace(btrim(COALESCE(author.full_name, '')),
                                '\s+', ' ', 'g'),
                 ' ', 1
               ), ''
             ),
             NULLIF(btrim(COALESCE(author.display_name, '')), '')
           )
    INTO v_actor_name
    FROM public.profiles AS author
    WHERE author.id = v_actor;
    v_actor_name := NULLIF(btrim(left(COALESCE(v_actor_name, ''), 120)), '');
  END IF;

  INSERT INTO public.agreement_part_events (
    proposal_id, part_id, part_key, action, actor, actor_name, why, before, after
  )
  SELECT
    p_proposal_id,
    NULLIF(after.part->>'id', '')::uuid,
    COALESCE(after.part->>'part_key', before.part->>'part_key'),
    CASE
      WHEN before.part IS NULL THEN 'added'
      WHEN after.part IS NULL THEN 'removed'
      WHEN (before.part - 'position' - 'id')
             IS DISTINCT FROM (after.part - 'position' - 'id') THEN 'edited'
      ELSE 'reordered'
    END,
    v_actor, v_actor_name, v_why,
    before.part, after.part
  FROM (
    SELECT e.part->>'part_key' AS key, e.part AS part
    FROM jsonb_array_elements(COALESCE(p_before, '[]'::jsonb)) AS e(part)
  ) AS before
  FULL OUTER JOIN (
    SELECT e.part->>'part_key' AS key, e.part AS part
    FROM jsonb_array_elements(COALESCE(p_after, '[]'::jsonb)) AS e(part)
  ) AS after ON after.key = before.key
  WHERE before.part IS NULL
     OR after.part IS NULL
     -- `id` is re-minted on every save (the write is DELETE-then-INSERT), so
     -- it is never a change; `position` alone is a reorder, not an edit.
     OR (before.part - 'id') IS DISTINCT FROM (after.part - 'id');
END;
$$;
REVOKE ALL ON FUNCTION public._log_agreement_part_events(uuid, jsonb, jsonb, text)
  FROM PUBLIC, anon, authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- PART 7 — Drop the old arities BEFORE widening (the overload hazard)
--
-- A DROP takes the ACL with it; every REVOKE/GRANT pair is re-issued beside
-- the new body below.
--
-- R31 — AND THE OLD ARITY COMES BACK, as a thin wrapper. Dropping a hardened
-- arity outright is what this file did first, and it broke something no gate
-- in this wave could see: seed/00-legacy-grants.sql replays 00511's hardening
-- as ONE statement naming seventeen functions, guarded against
-- undefined_function. With the four-argument
-- sign_design_services_agreement_with_trusted_ip gone, that statement raised
-- and the guard swallowed the hardening of the other SIXTEEN — eight EXECUTE
-- tuples survived on a fresh `supabase db reset` that the 00511 manifest says
-- must not, and three suites went red. The generator now emits one guarded
-- statement per function, so a dropped signature can only ever cost itself;
-- and every arity 00511 hardened is restored below with the same ACL, so the
-- manifest it pins is whole.
--
-- Each restored arity delegates to the widened one, which therefore carries NO
-- DEFAULTS: a defaulted argument on the wide body beside a narrow body of the
-- same name is exactly the ambiguity PART 7 was written to avoid. Old callers
-- reach the wrapper, new callers name every argument, and neither call has two
-- candidates.
-- ═══════════════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.sign_design_services_agreement_with_trusted_ip(uuid, text, uuid, text);
DROP FUNCTION IF EXISTS public._sign_design_services_agreement_authorized(uuid, text, uuid, text);
DROP FUNCTION IF EXISTS public.upsert_agreement_parts(uuid, jsonb);

-- ═══════════════════════════════════════════════════════════════════════════
-- PART 8 — upsert_agreement_parts, widened
--
-- 00575:2623 body VERBATIM. The deltas, and nothing else: a trailing p_why;
-- validation for the two Wave-2 fee shapes and the retainer's credit rule, in
-- the same words the rest of the loop uses (N-7 — no designer reads the name
-- of a constraint); R9's one-fee-basis refusal beside W1's per-variant one;
-- the four Wave-2 columns projected inside the same GUC window; and the
-- change history written from the diff.
--
-- Everything W1 earned is untouched: the draft/authorship guard, the typed
-- money assertions, money-read-by-shape, the deferred position renumber, the
-- extracted _project_agreement_terms call (the projection is NOT forked), the
-- deliberate absence of R4's floor at this door, and both set_config restores
-- in the EXCEPTION handler.
-- ═══════════════════════════════════════════════════════════════════════════

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
  IF v_proposal.document_kind NOT IN ('legacy', 'design_services', 'service_addendum') THEN
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

    -- 'per_draw' is type-legal in the contract and not yet legal in the
    -- money row — the cadence CHECK widens in Wave 3. Until then it is
    -- refused in words a designer can act on, not in the words of a CHECK.
    IF v_kind = 'schedule' AND v_variant = 'cadence' THEN
      IF NULLIF(btrim(COALESCE(v_payload->>'cadence', '')), '') IS NOT NULL
         AND v_payload->>'cadence' NOT IN ('monthly', 'biweekly', 'milestone') THEN
        RAISE EXCEPTION 'billing runs monthly, every two weeks, or at milestones'
          USING ERRCODE = 'check_violation';
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
           WHEN 'rate_card'   THEN 'rate card'
           WHEN 'ceiling'     THEN 'ceiling'
           WHEN 'retainer'    THEN 'retainer'
           WHEN 'cadence'     THEN 'billing cadence'
           WHEN 'procurement' THEN 'furnishings deposit'
         END
    INTO v_duplicate
  FROM public.proposal_agreement_parts ap
  WHERE ap.proposal_id = p_proposal_id
    AND ap.kind = 'schedule'
    AND ap.variant IN ('rate_card', 'ceiling', 'retainer', 'cadence', 'procurement')
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
    ), 'monthly'),
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
REVOKE ALL ON FUNCTION public.upsert_agreement_parts(uuid, jsonb, text)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.upsert_agreement_parts(uuid, jsonb, text)
  TO authenticated;

-- R31 — the two-argument arity 00575 granted, restored as a wrapper. The Wave
-- 1 hook still calls it with two named arguments; a save with no why is a save
-- with no why, not a save through a different door.
CREATE OR REPLACE FUNCTION public.upsert_agreement_parts(
  p_proposal_id uuid,
  p_parts jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN public.upsert_agreement_parts(p_proposal_id, p_parts, NULL::text);
END;
$$;
REVOKE ALL ON FUNCTION public.upsert_agreement_parts(uuid, jsonb)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.upsert_agreement_parts(uuid, jsonb)
  TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- PART 9 — _sign_design_services_agreement_authorized, widened
--
-- 00575:915 body VERBATIM (Wave 1 re-headed 00412:767 here). Two deltas: a
-- trailing p_consent, and the consent merged into the signature row's
-- metadata at INSERT. Every refusal, the relaxed rate-card predicate, both
-- halves of R4's floor, the fingerprint agreement and the set_config restore
-- are unchanged.
-- ═══════════════════════════════════════════════════════════════════════════

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
  IF v_proposal.document_kind NOT IN ('design_services', 'service_addendum') THEN
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
REVOKE ALL ON FUNCTION public._sign_design_services_agreement_authorized(uuid, text, uuid, text, jsonb)
  FROM PUBLIC, anon, authenticated, service_role;

-- R31 — the four-argument arity, restored as a wrapper. Three live functions
-- still call it with four arguments (00412's two legs, 00462's two, 00511's
-- trusted-IP leg), and none of them is redefined here.
CREATE OR REPLACE FUNCTION public._sign_design_services_agreement_authorized(
  p_proposal_id uuid,
  p_signed_name text,
  p_client_id uuid,
  p_trusted_signed_ip text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN public._sign_design_services_agreement_authorized(
    p_proposal_id, p_signed_name, p_client_id, p_trusted_signed_ip, NULL::jsonb
  );
END;
$$;
REVOKE ALL ON FUNCTION public._sign_design_services_agreement_authorized(uuid, text, uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- PART 10 — sign_design_services_agreement_with_trusted_ip, widened
--
-- 00511:1825 body VERBATIM. Two deltas: a trailing p_consent, and the
-- pass-through. The service_role gate, the capability GUC, the txid stamp and
-- both restores are unchanged; the ACL is re-issued because the DROP above
-- took it.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.sign_design_services_agreement_with_trusted_ip(
  p_proposal_id uuid,
  p_signed_name text,
  p_client_id uuid,
  p_signed_ip text,
  p_consent jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_previous_capability text :=
    current_setting('app.commercial_signature_capability', true);
  v_result jsonb;
BEGIN
  IF current_setting('role', true) IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'trusted-IP design-services signing requires service_role'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  PERFORM set_config(
    'app.commercial_signature_capability',
    format(
      'commercial_signature:%s:%s:%s', p_proposal_id,
      'sign_design_services_agreement', pg_catalog.txid_current()
    ),
    true
  );
  v_result := public._sign_design_services_agreement_authorized(
    p_proposal_id, p_signed_name, p_client_id, p_signed_ip, p_consent
  );
  PERFORM set_config(
    'app.commercial_signature_capability',
    COALESCE(v_previous_capability, ''),
    true
  );
  RETURN v_result;
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config(
    'app.commercial_signature_capability',
    COALESCE(v_previous_capability, ''),
    true
  );
  RAISE;
END;
$$;
REVOKE ALL ON FUNCTION public.sign_design_services_agreement_with_trusted_ip(uuid, text, uuid, text, jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.sign_design_services_agreement_with_trusted_ip(uuid, text, uuid, text, jsonb)
  TO service_role;

-- R31 — 00511's four-argument arity, restored as a wrapper and hardened
-- exactly as 00511 hardened it. The sign route still takes this call for every
-- un-composed agreement; more importantly, this is the signature the
-- seventeen-function REVOKE in 00511 names, and the public hardening manifest
-- pins the arity as well as the body. The service_role gate, the capability
-- GUC and the txid stamp all live in the five-argument body it delegates to,
-- so this wrapper adds no authority of its own.
CREATE OR REPLACE FUNCTION public.sign_design_services_agreement_with_trusted_ip(
  p_proposal_id uuid,
  p_signed_name text,
  p_client_id uuid,
  p_signed_ip text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  RETURN public.sign_design_services_agreement_with_trusted_ip(
    p_proposal_id, p_signed_name, p_client_id, p_signed_ip, NULL::jsonb
  );
END;
$$;
REVOKE ALL ON FUNCTION public.sign_design_services_agreement_with_trusted_ip(uuid, text, uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.sign_design_services_agreement_with_trusted_ip(uuid, text, uuid, text)
  TO service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- PART 11 — _countersign_design_services_agreement_impl, grafted
--
-- 00575:1302 body VERBATIM (00475 -> 00511 -> 00566:304 -> 00575). Wave 1
-- re-headed this function; grafting from 00566 would silently revert F-2's
-- `IS NULL` disjunct in the addendum promotion loop and park every billable
-- hour on an uncapped agreement — the 00199-reverts-00185 failure mode.
--
-- TWO deltas, both inside the client_signed branch and both after every lock
-- this function takes: the four Wave-2 columns on the authority INSERT, and
-- the execution snapshot. NOTHING ELSE MOVES. In particular the
-- app_private.issue_invoice_for_actor( v_retainer_invoice_id, current_date,
-- v_actor ) call keeps its exact formatting and 'commercialDocumentId' keeps
-- its place — the hardening contract test matches both as literal fragments,
-- and this file adds NO new caller of the private invoice core.
--
-- Its body_sha256 is pinned in
-- supabase/tests/edge_api/public_sd_hardening_contract_test.sql and is
-- re-pinned in this same change. Signature, arguments, result type, proconfig,
-- SECURITY DEFINER, the ACL and the lock order are all unchanged.
-- ═══════════════════════════════════════════════════════════════════════════

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
    AND proposal.document_kind IN ('design_services', 'service_addendum')
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
        proposal.document_kind = 'design_services'
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
    AND proposal.document_kind IN ('design_services', 'service_addendum')
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

    IF v_proposal.document_kind = 'design_services' THEN
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
        v_project_id, p_proposal_id, 'design_services', true,
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
-- PART 12 — get_client_commercial_document_bundle, grafted
--
-- 00575:3393 body VERBATIM (00412 -> 00414 -> 00422 -> 00423 -> 00425:1214 ->
-- 00575). One delta: two keys beside `composed`. The 'legacy' early return is
-- untouched — a retired document is not composed, is not signable, and has no
-- consent to compose.
-- ═══════════════════════════════════════════════════════════════════════════

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
      'payload', ap.payload, 'required', ap.required
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
      )
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
      ELSE '{}'::jsonb END;
END;
$$;
REVOKE ALL ON FUNCTION public.get_client_commercial_document_bundle(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_client_commercial_document_bundle(uuid)
  TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- PART 13 — An addendum composed from the parts already in force (P7)
--
-- create_service_addendum is NOT redefined. It mints the addendum and copies
-- the terms row exactly as it does today (00422:1816); this is the second
-- act, called right after it, that brings the ORIGIN'S PART SET across so the
-- designer edits the agreement in force rather than retyping it.
--
-- The copy goes through upsert_agreement_parts like every other write, so the
-- money re-projects into the addendum's own terms row — which countersign
-- then snapshots into the replacement authority — and the designer's one line
-- about why lands in the history beside it.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.copy_agreement_parts_from_authority(
  p_proposal_id uuid,
  p_why text DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_proposal public.proposals%ROWTYPE;
  v_project_id uuid;
  v_source_proposal_id uuid;
  v_parts jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'composing an addendum requires an authenticated author'
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
  IF v_proposal.document_kind <> 'service_addendum' THEN
    RAISE EXCEPTION 'only an addendum carries the parts already in force'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT document.project_id INTO v_project_id
  FROM public.project_commercial_documents document
  WHERE document.proposal_id = p_proposal_id
    AND document.document_kind = 'service_addendum';
  IF v_project_id IS NULL THEN
    RAISE EXCEPTION 'this addendum is not bound to a project'
      USING ERRCODE = 'check_violation';
  END IF;

  -- The same read create_service_addendum makes at 00422:1849-1858.
  SELECT authority.source_proposal_id INTO v_source_proposal_id
  FROM public.project_billing_authorities authority
  WHERE authority.project_id = v_project_id AND authority.status = 'active'
  ORDER BY authority.effective_at DESC
  LIMIT 1;
  IF v_source_proposal_id IS NULL THEN
    RAISE EXCEPTION 'project % has no active billing authority', v_project_id
      USING ERRCODE = 'check_violation';
  END IF;

  -- Verbatim, in the same order, with new ids: upsert_agreement_parts is
  -- DELETE-then-INSERT and re-keys every row. sourceTemplateKey and
  -- sourcePartId ride across, because an addendum's part came from wherever
  -- the origin's did.
  SELECT jsonb_agg(jsonb_build_object(
           'kind', ap.kind,
           'variant', ap.variant,
           'partKey', ap.part_key,
           'title', ap.title,
           'payload', ap.payload,
           'required', ap.required,
           'clientVisible', ap.client_visible,
           'sourceTemplateKey', ap.source_template_key,
           'sourcePartId', ap.source_part_id
         ) ORDER BY ap.position, ap.id)
  INTO v_parts
  FROM public.proposal_agreement_parts ap
  WHERE ap.proposal_id = v_source_proposal_id;

  IF v_parts IS NULL OR jsonb_array_length(v_parts) = 0 THEN
    -- The agreement in force was never composed. That is not an error: the
    -- addendum simply starts from the seven facets it inherited, and the room
    -- seeds the standard parts on first open exactly as it does elsewhere.
    RETURN 0;
  END IF;

  PERFORM public.upsert_agreement_parts(p_proposal_id, v_parts, p_why);
  RETURN jsonb_array_length(v_parts);
END;
$$;
REVOKE ALL ON FUNCTION public.copy_agreement_parts_from_authority(uuid, text)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.copy_agreement_parts_from_authority(uuid, text)
  TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- PART 14 — What the objects are for
-- ═══════════════════════════════════════════════════════════════════════════

COMMENT ON COLUMN public.proposal_service_terms.fee_basis IS
  'How this agreement charges for design work: hourly (a rate card is '
  'present), flat, or per_phase. NULL means the agreement names no fee yet. '
  'Written ONLY by upsert_agreement_parts, from a schedule part R9 lets '
  'create authority — a record-only variant (cost_plus, percent_of_*, '
  'day_rate, package, pricing_basis, draws, allowances) leaves it NULL.';

COMMENT ON COLUMN public.proposal_service_terms.fee_amount_cents IS
  'The whole design fee in cents when fee_basis is flat, or the sum of the '
  'phase fees when it is per_phase. NULL on an hourly agreement, whose money '
  'lives in the rate card and the ceiling.';

COMMENT ON COLUMN public.proposal_service_terms.fee_schedule IS
  'The per-phase fee array as the part carries it, so the client''s copy and '
  'the authority can both print the schedule rather than only its total. '
  'NULL on every other fee basis.';

COMMENT ON COLUMN public.proposal_service_terms.retainer_credit_rule IS
  'What the retainer does: credited against fees, non_refundable, or '
  'replenishing. Read from the retainer part''s creditRule; it is the one '
  'field of that part Wave 1 read and had nowhere to land.';

COMMENT ON TABLE public.agreement_part_events IS
  'The change history of one agreement''s parts: what was added, edited, '
  'removed or reordered, by whom, and the one line the designer wrote about '
  'why. The LOG is studio-only (R8) and append-only through '
  'guard_commercial_immutable_row; written only by upsert_agreement_parts. '
  'The one exception is R34: on a service_addendum, the first `why` recorded '
  'reaches the homeowner, through _agreement_addendum_why — she reads why the '
  'change was made beside the change, which is what the composer promised '
  'the designer it would.';

COMMENT ON TABLE public.agreement_execution_snapshots IS
  'The copy the homeowner keeps (R12): frozen HTML composed at COUNTERSIGN '
  'from the client-visible parts, stamped with the fingerprint both parties '
  'signed against, never re-rendered on read and never a PDF. One row per '
  'agreement; the client reads it through '
  'get_client_commercial_document_bundle, never directly.';

COMMENT ON FUNCTION public.compose_agreement_consent(uuid) IS
  'The consent sentence, composed from the CLIENT-VISIBLE schedule parts in a '
  'canonical variant order that does not depend on the designer''s ordering. '
  'Twinned with composeConsentLine in the client portal''s consent-copy.ts; '
  'the SQL and jest suites pin the same literals so either one drifting turns '
  'the other red. Zero money parts returns the legacy literal verbatim. '
  'Readable only by the two parties to the agreement — the same predicate '
  'get_client_commercial_document_bundle states, so its call passes and a '
  'signed-in stranger''s does not.';

COMMIT;
