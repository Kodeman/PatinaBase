-- ═══════════════════════════════════════════════════════════════════════════
-- 00745 — Client payloads carry rooms: one line in several rooms, phase 2
--         (US-21 slice 3, W4; D7 phase 2; T-37, SQ-643)
-- ═══════════════════════════════════════════════════════════════════════════
-- CONTRACT §2 00745 and §1.3 (artifacts/pieces-building-room-2026-10-08/
-- build/CONTRACT.md); ruling Q4 (a join table, the primary room kept, three
-- phases).
--
-- CREATE OR REPLACE bases, each a full copy plus the change below:
--   get_client_project_selections          00441_ffe_release_delivery_and_n1_fix.sql:82
--   get_client_project_threshold           00580_room_concept_render.sql:167
--   get_client_commercial_document_bundle  00638_pay_link_readers_reheaded.sql:322
-- Each is still the newest body on pieces/build-room (checked 2026-10-08).
--
-- Adds GRANT/REVOKE → regenerate supabase/seed/00-legacy-grants.sql (the W4
-- reset owner, T-38, does it; CONTRACT §4).
--
-- ── WHAT THIS CHANGES ───────────────────────────────────────────────────────
-- Every client line gains two ADDITIVE keys:
--   unit   the line's unit (each, sq_ft, roll, …; 00729).
--   rooms  [{name, quantity, unit}], the rooms the line is in and each
--          room's share, in placement order.
-- roomName keeps its meaning, the PRIMARY room, so the iOS Patina app's
-- decoding of get_client_project_selections (ProjectsAPIClient.swift:120,
-- RemoteFFEItem) is unchanged. Nothing is removed or renamed.
--
-- Where rooms comes from (_client_line_rooms, below):
--   - an AUTHORIZED line (a furnishing_authorization_items row: the frozen
--     snapshot the client signed) reads snapshot->'placements'
--     ([{roomName, quantity, areaNote}], written by 00744; NULL for a
--     single-room line). Without it, the line is one room: the frozen room
--     name and the frozen quantity. A placement changed after release
--     (00734's recorded change) never moves what the client signed.
--   - any other line reads the live placements (project_ffe_placements,
--     00734); with none, it is one room: the primary room and the line's
--     quantity.
--   - a line with no room (throughout / unassigned) has rooms [].
-- A line's quantity may exceed its rooms' sum: the difference is waste and is
-- not printed here.
--
-- Unit on a frozen line is the snapshot's unit when 00744 wrote one, else the
-- live line's. 00730 refuses a unit change once a line is released, so the
-- two agree for every line under a live authorization.
--
-- A labor line (00732) appears as its own line, with its own unit: it bills
-- on its own line. Nothing marks it as labor.
--
-- ── NEVER IN A CLIENT PAYLOAD ───────────────────────────────────────────────
-- rough_cents (D12: protected by omission), the thread's need_label, and the
-- internal fields line_kind, link_kind and parent_ffe_item_id, and a
-- placement's area note. The readers keep their explicit allow-lists; the
-- snapshot is never projected whole (00744 also freezes needLabel, lineKind
-- and parentFfeItemId into it). Pinned by
-- supabase/tests/commercial/pieces_client_rooms_test.sql.
--
-- ── ACCESS ──────────────────────────────────────────────────────────────────
-- The three readers keep their grants, re-stated below as their bases did.
-- _client_line_rooms is SECURITY INVOKER and closed to every API role: it
-- runs only inside the three SECURITY DEFINER readers (as their owner), each
-- of which checks the caller's access to the project first. Granting it would
-- let any session read any line's rooms by id.
--
-- Idempotent: CREATE OR REPLACE FUNCTION throughout.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── 1. _client_line_rooms: one line's rooms, frozen or live ────────────────

CREATE OR REPLACE FUNCTION public._client_line_rooms(
  p_ffe_item_id uuid,
  p_frozen boolean,
  p_snapshot jsonb,
  p_room_name text,
  p_quantity integer,
  p_unit text
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT COALESCE(
    CASE
      WHEN p_frozen THEN (
        SELECT jsonb_agg(jsonb_build_object(
          'name', placement.value->>'roomName',
          'quantity', placement.value->'quantity',
          'unit', p_unit
        ) ORDER BY placement.ordinality)
        FROM jsonb_array_elements(
          CASE WHEN jsonb_typeof(p_snapshot->'placements') = 'array'
               THEN p_snapshot->'placements' ELSE '[]'::jsonb END
        ) WITH ORDINALITY AS placement(value, ordinality)
      )
      ELSE (
        SELECT jsonb_agg(jsonb_build_object(
          'name', room.name,
          'quantity', placement.quantity,
          'unit', p_unit
        ) ORDER BY placement.sort_order, room.sort_order, placement.id)
        FROM public.project_ffe_placements AS placement
        JOIN public.project_rooms AS room ON room.id = placement.project_room_id
        WHERE placement.ffe_item_id = p_ffe_item_id
      )
    END,
    -- No placements: the line is in its one room, or in none.
    CASE WHEN p_room_name IS NULL THEN '[]'::jsonb
         ELSE jsonb_build_array(jsonb_build_object(
           'name', p_room_name, 'quantity', p_quantity, 'unit', p_unit))
    END
  );
$$;

REVOKE ALL ON FUNCTION public._client_line_rooms(uuid, boolean, jsonb, text, integer, text)
  FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON FUNCTION public._client_line_rooms(uuid, boolean, jsonb, text, integer, text) IS
  'Internal to the client readers (00745). One line''s rooms as [{name, quantity, unit}]: an authorized line reads its frozen snapshot''s placements (00744), else its frozen room and quantity; any other line reads project_ffe_placements (00734), else its primary room and quantity; no room gives []. Never the area note. Closed to every API role: the calling SECURITY DEFINER reader has already checked access.';

-- ─── 2. get_client_project_selections (base 00441:82) ───────────────────────
-- The iOS Patina app's reader. Adds unit and rooms; an authorized line (its
-- source_authorization_item_id, set at execution, 00578) reads its frozen
-- snapshot.

CREATE OR REPLACE FUNCTION public.get_client_project_selections(p_project_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $$
DECLARE v_actor uuid:=auth.uid(); v_project public.projects%ROWTYPE;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'authentication required' USING ERRCODE='insufficient_privilege'; END IF;
  SELECT * INTO v_project FROM public.projects WHERE id=p_project_id;
  IF NOT FOUND OR NOT(v_project.client_id=v_actor OR public.is_studio_comember(v_project.designer_id)) THEN
    RAISE EXCEPTION 'project not found or not accessible' USING ERRCODE='insufficient_privilege';
  END IF;
  RETURN jsonb_build_object('projectId',v_project.id,'projectName',v_project.name,'selections',COALESCE((
    SELECT jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
      'id',item.id,'threadId',item.selection_thread_id,'name',item.name,
      'category',item.ffe_category,'assignmentScope',item.assignment_scope,
      'roomId',item.project_room_id,'roomName',room.name,'quantity',item.quantity,
      'productId',item.product_id,'logisticsStatus',item.status,
      -- 00745: additive.
      'unit',line_unit.unit,
      'rooms',public._client_line_rooms(
        item.id, authorization_item.id IS NOT NULL, authorization_item.snapshot,
        COALESCE(room.name, authorization_item.room_name),
        COALESCE(authorization_item.quantity, item.quantity), line_unit.unit)
    )) ORDER BY room.sort_order NULLS FIRST,item.sort_order,item.created_at,item.id)
    FROM public.project_ffe_items item
    LEFT JOIN public.project_rooms room ON room.id=item.project_room_id
    LEFT JOIN public.furnishing_authorization_items authorization_item
      ON authorization_item.id=item.source_authorization_item_id
    CROSS JOIN LATERAL (SELECT COALESCE(authorization_item.snapshot->>'unit', item.unit) AS unit) line_unit
    WHERE item.project_id=p_project_id AND item.removed_at IS NULL
      AND item.design_disposition='selected'
  ),'[]'::jsonb));
END;
$$;

REVOKE ALL ON FUNCTION public.get_client_project_selections(uuid)
FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_client_project_selections(uuid) TO authenticated,service_role;

-- ─── 3. get_client_project_threshold (base 00580:167) ───────────────────────
-- The Client Page's reader. Both branches add unit and rooms: furnishings
-- from the frozen authorization snapshot, trade from the live line.

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
        'conceptRenderUrl', room.concept_render_url,
        'conceptRenderCaption', room.concept_render_caption,
        'conceptRenderUploadedAt', room.concept_render_uploaded_at,
        'conceptRenderUploadedBy', room.concept_render_uploaded_by,
        'quantity', authorization_item.quantity,
        -- 00745: additive. The rooms she signed, from the frozen snapshot.
        'unit', line_unit.unit,
        'rooms', public._client_line_rooms(
          item.id, true, authorization_item.snapshot,
          COALESCE(room.name, authorization_item.room_name),
          authorization_item.quantity, line_unit.unit),
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
      CROSS JOIN LATERAL (
        SELECT COALESCE(authorization_item.snapshot->>'unit', item.unit) AS unit
      ) AS line_unit
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
        'conceptRenderUrl', room.concept_render_url,
        'conceptRenderCaption', room.concept_render_caption,
        'conceptRenderUploadedAt', room.concept_render_uploaded_at,
        'conceptRenderUploadedBy', room.concept_render_uploaded_by,
        'quantity', item.quantity,
        -- 00745: additive. No snapshot table on this branch: the live line.
        'unit', item.unit,
        'rooms', public._client_line_rooms(
          item.id, false, NULL,
          COALESCE(room.name, section.room_name),
          item.quantity, item.unit),
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

REVOKE ALL ON FUNCTION public.get_client_project_threshold(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_client_project_threshold(uuid)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.get_client_project_threshold(uuid) IS
  'The Client Page''s reader: what a client authorized on a project — furnishings snapshot lines (kind furnishings, money from the signed furnishing_authorization_items snapshot) and trade scope presence lines (kind trade, with tradeJourney). Trade cost, vendor cost, markup, purchase-order fields and bids never appear, and no live unsigned project_ffe_items money on any path. 00580 adds four room facts to each line — conceptRenderUrl, conceptRenderCaption, conceptRenderUploadedAt, conceptRenderUploadedBy — off the project_rooms join both branches already make; conceptRenderUrl is an object path inside the PRIVATE room-renders bucket, not a URL. 00745 adds unit and rooms [{name, quantity, unit}] to each line (furnishings from the frozen snapshot''s placements, trade from the live line); roomName stays the primary room. rough_cents, need_label, line_kind, link_kind and parent_ffe_item_id never appear. Carries 00423''s client-facing payload over 00441''s authorization preamble, key names and ordering.';

-- ─── 4. get_client_commercial_document_bundle (base 00638:322) ──────────────
-- furnishings.items gains unit and rooms, from the authorization row's own
-- frozen snapshot. Nothing else changes.

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
        ) ORDER BY a.sort_order, a.id) FROM public.furnishing_authorization_items a
          CROSS JOIN LATERAL (
            SELECT COALESCE(
              a.snapshot->>'unit',
              (SELECT line.unit FROM public.project_ffe_items line
               WHERE line.id = a.source_ffe_item_id),
              'each') AS unit
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

COMMENT ON FUNCTION public.get_client_commercial_document_bundle(uuid) IS
  'The homeowner''s (or a studio co-member''s) read of one commercial document: the paper, its signatures, and the arm its kind names. designBuild.depositOffer carries the live deposit invoice, its figure and its label, and payToken NULL — since 00636 invoice_links stores only a hash, and this function is STABLE so it may not call the revoking minter (00638). 00745: each furnishings item carries unit and rooms [{name, quantity, unit}] from its frozen snapshot; roomName stays the primary room.';
REVOKE ALL ON FUNCTION public.get_client_commercial_document_bundle(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_client_commercial_document_bundle(uuid)
  TO authenticated;

COMMIT;
