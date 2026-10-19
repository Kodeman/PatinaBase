-- 00837 — Commercial reviewed-version conflicts are HTTP 409 domain errors.
-- Lineage: 00412 → 00423 → 00575 → 00578. Entire latest body grafted below.
-- Only the two deliberate fingerprint-conflict SQLSTATEs change. PostgREST 14
-- retries 40001, so using it for unchanged business conflicts never terminates.
-- Genuine PostgreSQL serialization failures, author checks, locks, dispatch and
-- exception setting restoration remain unchanged. No public signature change.

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
      USING ERRCODE = 'PT409';
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
    -- R48 (W3R2-01) — the door asks the same question upsert_agreement_parts
    -- asks, because a part hidden before this refusal existed is still on the
    -- stack. _agreement_design_build_part reads the AUTHORED row, so without
    -- this the arm below validates a price the client's projection has
    -- already dropped and the homeowner signs a paper naming none.
    IF EXISTS (
      SELECT 1 FROM public.proposal_agreement_parts ap
      WHERE ap.proposal_id = p_proposal_id
        AND ap.kind = 'schedule'
        AND ap.variant IN ('pricing_basis', 'draws')
        AND NOT ap.client_visible
    ) THEN
      RAISE EXCEPTION
        'your client signs the price and the draws, so neither can be hidden from her'
        USING ERRCODE = 'check_violation';
    END IF;

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

    -- R48 — and the fee half of R22's floor, asked of this class in its own
    -- words. _agreement_fee_unnamed reads pricing_basis through the same
    -- client_visible filter as every other fee, so this is the second reading
    -- of the same rule: whatever else is true, the paper she signs names a
    -- price she can read.
    IF public._agreement_fee_unnamed(p_proposal_id) THEN
      RAISE EXCEPTION 'this agreement names no price your client can read'
        USING ERRCODE = 'check_violation';
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

    -- R11's other half — AN ATTESTATION OF RECEIPT NEEDS SOMETHING RECEIVED.
    -- An attachment on the homeowner's copy that asks her to tick "I received
    -- this" must carry the words she is attesting she received; the tick is
    -- recorded onto her signature row by `part_key`, and a leaf whose wording
    -- is still with counsel would put an empty document into that record.
    IF EXISTS (
      SELECT 1
      FROM public.proposal_agreement_parts ap
      WHERE ap.proposal_id = p_proposal_id
        AND ap.kind = 'attachment'
        AND ap.client_visible
        AND (ap.payload->'acknowledgeRequired') = 'true'::jsonb
        AND NULLIF(btrim(COALESCE(ap.payload->>'body', '')), '') IS NULL
    ) THEN
      RAISE EXCEPTION 'an attachment your client must confirm she received needs its wording first'
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
      USING ERRCODE = 'PT409';
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

REVOKE EXECUTE ON FUNCTION public.send_commercial_document(uuid, text, text, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.send_commercial_document(uuid, text, text, timestamptz) TO authenticated;
