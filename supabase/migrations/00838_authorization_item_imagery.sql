-- 00838 — Frozen client-safe authorization photo references, not immutable pixels.
-- Lineage: snapshot helper 00744; client bundle 00755; studio preview 00836.
-- Preserve all historical rows/keys, author/client guards, STABLE reads and payment bodies.
-- Own primary order is 00807; invalid own media never falls back to catalog.
CREATE OR REPLACE FUNCTION public._furnishing_authorization_item_snapshot(
  p_line public.project_ffe_items
)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT jsonb_build_object(
    'budgetMinCents', p_line.budget_min_cents,
    'budgetMaxCents', p_line.budget_max_cents,
    'docCode', p_line.doc_code,
    'customFields', p_line.custom_fields,
    'notes', p_line.notes,
    'productImageUrl', (SELECT pr.images[1] FROM public.products pr
                        WHERE pr.id = p_line.product_id),
    'clientImage', (SELECT jsonb_build_object('version', 1, 'url', CASE WHEN (chosen.url ~* '^(https://[a-z0-9.-]+(:[0-9]+)?|http://(localhost|127\.0\.0\.1|\[::1\])(:[0-9]+)?)(/|$)' AND chosen.url !~ '[[:space:]\\@#%]' AND chosen.url !~* '/storage/v1/object/(sign|authenticated)/' AND chosen.url !~* '[?&](x-amz-[^=]*|x-goog-[^=]*|awsaccesskeyid|signature|sig|token|expires?|expiry|policy|key-pair-id|se|sp|sv|st|sas)=' AND chosen.url !~ '[?&][^=]*%') THEN chosen.url END)
      FROM (SELECT CASE WHEN EXISTS (SELECT 1 FROM public.project_ffe_item_images image WHERE image.item_id=p_line.id)
        THEN (SELECT image.url FROM public.project_ffe_item_images image WHERE image.item_id=p_line.id
          ORDER BY image.is_primary DESC, image.position, image.created_at, image.id LIMIT 1)
        ELSE (SELECT pr.images[1] FROM public.products pr WHERE pr.id=p_line.product_id) END AS url) chosen),
    'unit', NULLIF(p_line.unit, 'each'),
    'needLabel', (SELECT NULLIF(t.need_label, p_line.name)
                  FROM public.project_ffe_selection_threads t
                  WHERE t.id = p_line.selection_thread_id),
    'lineKind', NULLIF(p_line.line_kind, 'goods'),
    'parentFfeItemId', CASE WHEN p_line.line_kind = 'labor'
                            THEN p_line.parent_ffe_item_id END,
    'placements', (
      SELECT CASE WHEN count(*) > 1 THEN jsonb_agg(jsonb_build_object(
          'roomName', room.name,
          'quantity', fp.quantity,
          'areaNote', fp.area_note
        ) ORDER BY fp.sort_order, fp.created_at, fp.id)
      END
      FROM public.project_ffe_placements fp
      JOIN public.project_rooms room ON room.id = fp.project_room_id
      WHERE fp.ffe_item_id = p_line.id
    )
  );
$$;
REVOKE ALL ON FUNCTION public._furnishing_authorization_item_snapshot(public.project_ffe_items) FROM PUBLIC, anon, authenticated, service_role;

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
          -- 00745: additive. The rooms on the paper, from this row's frozen
          -- snapshot (00744 placements), else its one frozen room.
          'unit', line_unit.unit,
          'rooms', public._client_line_rooms(
            a.source_ffe_item_id, true, a.snapshot, a.room_name, a.quantity,
            line_unit.unit),
          'clientUnitPriceCents', a.client_unit_price_cents,
          'clientLineTotalCents', a.client_line_total_cents,
          'sourceFfeItemId', a.source_ffe_item_id, 'sortOrder', a.sort_order
        ) || CASE WHEN a.snapshot->'clientImage'->'version' = '1'::jsonb
          THEN jsonb_build_object('clientImage', jsonb_build_object('version', 1, 'url',
            CASE WHEN jsonb_typeof(a.snapshot#>'{clientImage,url}')='string' AND ((a.snapshot#>>'{clientImage,url}') ~* '^(https://[a-z0-9.-]+(:[0-9]+)?|http://(localhost|127\.0\.0\.1|\[::1\])(:[0-9]+)?)(/|$)' AND (a.snapshot#>>'{clientImage,url}') !~ '[[:space:]\\@#%]' AND (a.snapshot#>>'{clientImage,url}') !~* '/storage/v1/object/(sign|authenticated)/' AND (a.snapshot#>>'{clientImage,url}') !~* '[?&](x-amz-[^=]*|x-goog-[^=]*|awsaccesskeyid|signature|sig|token|expires?|expiry|policy|key-pair-id|se|sp|sv|st|sas)=' AND (a.snapshot#>>'{clientImage,url}') !~ '[?&][^=]*%') THEN a.snapshot#>>'{clientImage,url}' END))
          ELSE '{}'::jsonb END ORDER BY a.sort_order, a.id) FROM public.furnishing_authorization_items a
          CROSS JOIN LATERAL (
            -- 00755 (F-E4): the snapshot's unit, defaulting to 'each'.
            SELECT COALESCE(a.snapshot->>'unit', 'each') AS unit
          ) AS line_unit
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
REVOKE ALL ON FUNCTION public.get_client_commercial_document_bundle(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_client_commercial_document_bundle(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_commercial_document_send_snapshot(p_proposal_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_proposal public.proposals%ROWTYPE;
  v_result jsonb;
  v_client jsonb;
BEGIN
  SELECT * INTO v_proposal FROM public.proposals WHERE id = p_proposal_id;
  IF NOT FOUND OR v_proposal.document_kind = 'legacy'
     OR NOT public._can_author_proposal(v_proposal.designer_id)
  THEN
    RAISE EXCEPTION 'commercial document % not found or access denied', p_proposal_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  v_result := jsonb_build_object(
    'proposalId', v_proposal.id,
    'updatedAt', v_proposal.updated_at,
    'documentFingerprint', public._commercial_document_fingerprint(v_proposal.id)
  );
  IF v_proposal.document_kind = 'furnishings_authorization' THEN
    v_client := public.get_client_commercial_document_bundle(p_proposal_id);
    v_result := v_result || jsonb_build_object('furnishingsPreview', jsonb_build_object(
      'proposalId', v_client #> '{document,id}',
      'projectId', v_client #> '{document,projectId}',
      'title', v_client #> '{document,title}',
      'state', v_client #> '{document,commercialState}',
      'body', jsonb_build_object(
        'totalAmountCents', v_client #> '{document,totalAmountCents}',
        'depositPercent', v_client #> '{document,depositPercent}',
        -- The shared body derives the contractual deposit from these two
        -- fingerprinted fields, never the client's invoice-backed amounts.
        'items', COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'description', item->'name',
            'roomName', item->'roomName',
            'quantity', item->'quantity',
            'unit', item->'unit',
            'rooms', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
              'name', room->'name', 'quantity', room->'quantity', 'unit', room->'unit'
            ) ORDER BY room_order), '[]'::jsonb)
              FROM jsonb_array_elements(item->'rooms') WITH ORDINALITY AS rooms(room, room_order)),
            'clientUnitPriceCents', item->'clientUnitPriceCents',
            'clientLineTotalCents', item->'clientLineTotalCents',
            'allowance', item->>'itemType' = 'allowance',
            'currency', COALESCE(item->>'currency', 'USD')
          ) || CASE WHEN item ? 'clientImage' THEN jsonb_build_object('clientImage', item->'clientImage') ELSE '{}'::jsonb END ORDER BY item_order)
          FROM jsonb_array_elements(v_client #> '{furnishings,items}')
            WITH ORDINALITY AS items(item, item_order)
        ), '[]'::jsonb)
      )
    ));
  END IF;
  RETURN v_result;
END;
$$;
REVOKE ALL ON FUNCTION public.get_commercial_document_send_snapshot(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_commercial_document_send_snapshot(uuid) TO authenticated;
