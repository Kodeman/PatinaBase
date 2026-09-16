-- ═══════════════════════════════════════════════════════════════════════════
-- 00638 — People room CRM · W4 round 1: the two pay-link readers 00636 left
--         behind (review B-1 / QA-B2)
--
-- 00636 hardened invoice_links: sha256(token) at rest, a 30-day expires_at,
-- and `token` frozen at NULL by chk_invoice_links_token_frozen. Five readers
-- were re-headed there. TWO WERE NOT, and both are on the money rail:
--
--   issue_agreement_draw_invoice          (00578:6904-6907) SELECT link.token
--   get_client_commercial_document_bundle (00578:7797-7800) SELECT link.token
--
-- Both therefore answer payToken = NULL for every invoice, deterministically,
-- by the CHECK. Downstream there is no second route: the client portal's sign
-- route (api/proposals/[id]/sign/route.ts:95-104) drops the WHOLE deposit
-- offer on an empty token, and commercial-documents.ts:673-681 ("R50 — every
-- field or nothing") nulls the bundle's offer that door-gate.tsx builds
-- /pay/<token> from. A homeowner signing a design-build agreement was shown no
-- way to pay her deposit.
--
-- THE TWO FIXES ARE DIFFERENT, because the two functions are:
--
--  · issue_agreement_draw_invoice is VOLATILE and IS the issuing transaction,
--    so it MINTS: ensure_invoice_link(v_invoice_id) revokes the link
--    invoice_link_mint_on_issue just wrote, mints a fresh one, and returns the
--    raw value once. Nobody holds the revoked address — it was created three
--    statements earlier in this same transaction. The sign route's offer is
--    live again, with a real /pay address.
--
--  · get_client_commercial_document_bundle is STABLE and is read on every page
--    load. It may NOT call the volatile minter: that would revoke the payer's
--    address every time the door re-rendered. It takes get_invoice_link's
--    treatment instead (00636) — carry no address, and let the surface name a
--    door it can honestly state. payToken is NULL::text, stated once, in the
--    open. The client portal's adapter stops requiring it, and the door gate's
--    reload path points at the deposit letter in the homeowner's own letterbox
--    (`/?invoice=<id>`), which is the surface the door's own R50 note already
--    names as where the deposit lives after the visit it was signed in.
--
-- Lineage (grep -rln "CREATE OR REPLACE FUNCTION[^(]*<name>" supabase/migrations/*.sql
-- | sort | tail -1, run 2026-09-15):
--   issue_agreement_draw_invoice          00578 → this file (00578's body
--                                         verbatim, one statement changed)
--   get_client_commercial_document_bundle 00412 → 00414 → 00422 → 00423 →
--                                         00425 → 00575 → 00577 → 00578 →
--                                         this file (00578's body verbatim,
--                                         one sub-select changed)
--
-- Both keep their existing grants, restated beside each body so the posture is
-- readable in one place; no new object, no new privilege → the legacy-grants
-- seed is regenerated anyway (python3 scripts/generate-legacy-grants.py).
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. issue_agreement_draw_invoice — the deposit's address is minted here
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

  -- THE ADDRESS IS MINTED, NOT READ BACK (W4 r1 B-1 / QA-B2).
  --
  -- invoice_link_mint_on_issue (00574:143-149) has already fired inside this
  -- transaction, because issue_invoice UPDATEs status — but since 00636 the
  -- row it wrote stores sha256(token) and holds `token` at NULL under
  -- chk_invoice_links_token_frozen, so re-reading the column answers NULL for
  -- every invoice, for ever. The client-portal sign route reads an empty
  -- payToken as "no deposit offer" and has no second route, so the homeowner
  -- signed a design-build agreement and was shown no way to pay her deposit.
  -- ensure_invoice_link is the one producer that can still emit a raw value:
  -- it revokes the link this transaction just minted, mints a fresh one, and
  -- returns it once. This IS the issuing transaction, so nobody is holding the
  -- address it revokes. NULL still means "no address to carry" — a draft, or a
  -- lost mint race — and the caller falls back exactly as it did before
  -- (00574:132-135's own rule, 00636's M7 valve).
  v_pay_token := public.ensure_invoice_link(v_invoice_id);

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
  'Bills one design-build draw on the 00571 studio-invoice rail. The deposit is billable at client_signed, by the studio or by the sign route''s service client; every other draw waits for an executed agreement with a live billing authority. Retainage is withheld, not billed: the invoice carries net_cents. payToken is MINTED through ensure_invoice_link inside this transaction (00638): since 00636 the stored token is a hash, so the address can only be emitted by a producer, never read back.';
REVOKE ALL ON FUNCTION public.issue_agreement_draw_invoice(uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.issue_agreement_draw_invoice(uuid, text)
  TO authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. get_client_commercial_document_bundle — the client's read carries no
--    credential
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
        -- R50 (W3R2-02): THE OFFER IS RE-DERIVED, NOT REMEMBERED.
        --
        -- The deposit offer used to exist only in the sign route's response,
        -- so it died with the page: a homeowner who signed, reloaded, and came
        -- back found the receipt region gone and the deposit reachable only
        -- two levels down under EARLIER INVOICES. It is a row, so it is read
        -- as one — the deposit draw, its live invoice, and that invoice's own
        -- link token, which is the same token the sign route handed this same
        -- client minutes earlier.
        --
        -- Null the moment it is settled: a paid or voided deposit is not an
        -- offer, and 'Your deposit is ready' printed over a paid one is the
        -- same ask repeated at her.
        --
        -- AND IT CARRIES NO ADDRESS (W4 r1 B-1 / QA-B2). This branch read
        -- invoice_links.token, which 00636 froze at NULL, so payToken has been
        -- NULL on every call since — and the client adapter's "every field or
        -- nothing" rule (R50) then nulled the whole offer. The address cannot
        -- be re-derived here: the stored value is a hash, and the one producer
        -- that emits a raw token (ensure_invoice_link) REVOKES the live link
        -- to mint it, which this STABLE read would do on every page load,
        -- killing the payer's own address under them. So the offer carries its
        -- invoice, its figure and its label, and the door names the letter in
        -- her letterbox instead of a /pay address it cannot honestly state.
        'depositOffer', (
          SELECT jsonb_build_object(
            'invoiceId', invoice.id,
            'amountCents', invoice.total_cents - invoice.amount_paid_cents,
            'label', d.label,
            'payToken', NULL::text)
          FROM public.agreement_draw_invoices d
          JOIN public.invoices invoice ON invoice.id = d.invoice_id
          WHERE d.proposal_id = p_proposal_id
            AND d.draw_key = 'deposit'
            AND invoice.status NOT IN ('void', 'paid')
            AND invoice.amount_paid_cents < invoice.total_cents
          LIMIT 1),
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

COMMENT ON FUNCTION public.get_client_commercial_document_bundle(uuid) IS
  'The homeowner''s (or a studio co-member''s) read of one commercial document: the paper, its signatures, and the arm its kind names. designBuild.depositOffer carries the live deposit invoice, its figure and its label, and payToken NULL — since 00636 invoice_links stores only a hash, and this function is STABLE so it may not call the revoking minter (00638).';
REVOKE ALL ON FUNCTION public.get_client_commercial_document_bundle(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_client_commercial_document_bundle(uuid)
  TO authenticated;
