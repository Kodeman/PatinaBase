-- ═══════════════════════════════════════════════════════════════════════════
-- 00666 — Close SQ-208's review of 00661: invoices refuse non-USD selections,
--         a committed row holds one currency, catalog repricing relabels USD,
--         staging fails closed, and the formula guard covers its gaps
-- Lineage (each body copied verbatim from the file named last, delta grafted):
--   _ffe_has_formula_like_text        00661 → here
--   _ffe_import_commercial_decision   00661 → here
--   stage_project_ffe_document_extraction (the wrapper)  00661 → here. The
--     renamed _stage_project_ffe_document_extraction_00661_impl is untouched.
--   commit_project_ffe_import (the wrapper)  00435 → 00439 → 00447 → 00661 →
--     here. The _commit_project_ffe_import_00446_impl (00439 body) is untouched.
--   _place_product_in_project_v2_00438_impl  00435 (as
--     place_product_in_project_v2; renamed by 00439) → here.
--   _apply_client_decision_authorized  00399 → 00413 → 00464 → here.
-- Reconciles: none. No migration after 00661 redefines any of these. Both
--   older bodies were checked against the local database's prosrc before the
--   delta was grafted.
--
-- Findings (artifacts: the SQ-208 review plan, F1–F10):
--   F1  invoice_line_items gets a USD trigger. create_draft_invoice
--       (00511) copies any project item into an `ffe` line on an invoice
--       inserted as USD (00511; 00178 default), so a EUR selection was billed
--       as USD cents. A trigger covers every writer. The writers that set
--       ffe_item_id are create_draft_invoice, the two furnishings-authorization
--       executors (00578 bodies, whose source lines 00661 already guards) and
--       designers inserting directly under the 00178/00316 RLS policies.
--       _void_invoice_authorized_legacy_00397 (00574) only clears ffe_item_id.
--       The other writers (studio invoices, draws, milestones, agreements,
--       trade scopes) never set it.
--   F3  A confirmed price in a currency other than USD is refused on a row
--       whose placement came from a catalog product. Placement copies that
--       product's USD prices into all three price columns (00435), and the
--       confirmation replaces only one, so relabelling the row would leave
--       USD amounts under a foreign code. The alternative, clearing the other
--       columns, would silently drop catalog prices and leave a product-linked
--       row that every later catalog repricing (fill, decision, supersede)
--       resets to USD anyway. So a product row stays USD. A USD confirmation,
--       or one without a price, still commits.
--   F4  The placeholder fill (00435) and the non-blocking decision feed-through
--       (00464) set currency = 'USD' with the catalog prices they write. Every
--       other price writer keeps the row single-currency. Inserts take the
--       'USD' default. supersede carries the currency or writes 'USD' (00661).
--       Configuration pricing (00403/00462 lineage) only touches product-linked
--       rows, which F3 and F4 keep USD. reprice_replacement_purchase_order
--       touches PO-linked rows, which 00661's trigger keeps USD.
--   F5  The staging wrapper raises unless its impl returns a boolean `reused`.
--       Before, a missing key made the IF NULL and skipped the flagging.
--   F6  The formula guard allows leading whitespace or control characters
--       before = + @ -letter, flags -<digit> unless the text is a plain
--       number, and checks object keys as well as string leaves. Numbers are
--       never inspected, so a negative number in a numeric field passes. The
--       decision validator now calls the same guard for maker and sku.
--       lib.ts applies the same -<digit> rule.
--   F8  A placement idempotency key that exists before this commit places
--       anything was written by an earlier direct place_product_in_project_v2
--       call. Its replayed 'created' names a selection this commit did not
--       create, so a row with a commercial decision there is refused as reused.
--   Not here: F2 (a deploy-order rule, 00660 before 00661 and 00666), F7, F9
--   and F10.
--
-- Grants: CREATE OR REPLACE keeps every ACL. The one new function is a trigger
--   function, REVOKEd from every role like 00661's guards;
--   seed/00-legacy-grants.sql is regenerated.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── F1: an invoice line may bill only a USD selection ─────────────────────
-- SECURITY DEFINER so RLS cannot hide the selection and fail open. The fire
-- order keeps a_lock_invoice_for_line_insert_trg (00397) first.
CREATE OR REPLACE FUNCTION public._ffe_guard_usd_invoice_line()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.project_ffe_items item
             WHERE item.id = NEW.ffe_item_id AND item.currency <> 'USD') THEN
    RAISE EXCEPTION 'invoices are denominated in USD; selection % is priced in another currency', NEW.ffe_item_id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ffe_usd_invoice_line ON public.invoice_line_items;
CREATE TRIGGER trg_ffe_usd_invoice_line
  BEFORE INSERT OR UPDATE OF ffe_item_id ON public.invoice_line_items
  FOR EACH ROW WHEN (NEW.ffe_item_id IS NOT NULL)
  EXECUTE FUNCTION public._ffe_guard_usd_invoice_line();

-- ── F6: the formula guard (00661 body; the candidate set and test are the delta)
-- True when any string value or object key anywhere in the value looks like a
-- spreadsheet formula or a command-line flag once leading whitespace and
-- control characters are skipped. A minus before a digit is flagged unless
-- the whole text is a plain number. JSON numbers are never inspected, so a
-- negative quantity or price stays legal.
CREATE OR REPLACE FUNCTION public._ffe_has_formula_like_text(p_value jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM jsonb_path_query(p_value, 'strict $.**') AS node
    CROSS JOIN LATERAL (
      SELECT node #>> '{}' WHERE jsonb_typeof(node) = 'string'
      UNION ALL
      SELECT jsonb_object_keys(CASE WHEN jsonb_typeof(node) = 'object' THEN node ELSE '{}'::jsonb END)
    ) AS candidate(value)
    WHERE candidate.value ~ '^[[:space:][:cntrl:]]*([=+@]|-[A-Za-z])'
       OR (candidate.value ~ '^[[:space:][:cntrl:]]*-[0-9]'
           AND candidate.value !~ '^[[:space:]]*-[0-9]+(\.[0-9]+)?[[:space:]]*$')
  );
$$;

-- ── F6: the decision validator (00661 body; maker/sku use the guard above) ─
CREATE OR REPLACE FUNCTION public._ffe_import_commercial_decision(p_commercial jsonb, p_ordinal integer)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_key text;
  v_maker text;
  v_sku text;
  v_price integer;
  v_currency text;
  v_basis text;
BEGIN
  IF jsonb_typeof(p_commercial) IS DISTINCT FROM 'object'
     OR (SELECT count(*) FROM jsonb_object_keys(p_commercial)) <> 5
     OR NOT p_commercial ?& ARRAY['maker', 'sku', 'unitPriceMinor', 'currency', 'priceBasis']
     OR jsonb_typeof(p_commercial -> 'maker') NOT IN ('string', 'null')
     OR jsonb_typeof(p_commercial -> 'sku') NOT IN ('string', 'null')
     OR jsonb_typeof(p_commercial -> 'currency') NOT IN ('string', 'null')
     OR jsonb_typeof(p_commercial -> 'priceBasis') NOT IN ('string', 'null')
     OR jsonb_typeof(p_commercial -> 'unitPriceMinor') NOT IN ('number', 'null')
  THEN
    RAISE EXCEPTION 'import row % commercial decision must carry maker, sku, unitPriceMinor, currency and priceBasis', p_ordinal
      USING ERRCODE = 'check_violation';
  END IF;

  v_maker := NULLIF(btrim(p_commercial ->> 'maker'), '');
  v_sku := NULLIF(btrim(p_commercial ->> 'sku'), '');
  v_currency := NULLIF(btrim(p_commercial ->> 'currency'), '');
  v_basis := NULLIF(btrim(p_commercial ->> 'priceBasis'), '');
  IF p_commercial ->> 'unitPriceMinor' IS NOT NULL THEN
    IF p_commercial ->> 'unitPriceMinor' ~ '^[0-9]{1,9}$' THEN
      v_price := (p_commercial ->> 'unitPriceMinor')::integer;
    END IF;
    IF v_price IS NULL OR v_price > 100000000 THEN
      RAISE EXCEPTION 'import row % unitPriceMinor must be an integer from 0 to 100000000', p_ordinal
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  FOREACH v_key IN ARRAY ARRAY[v_maker, v_sku] LOOP
    IF v_key IS NOT NULL AND (
      length(v_key) > 200 OR public._ffe_has_formula_like_text(to_jsonb(v_key)) OR v_key ~ '[[:cntrl:]]'
    ) THEN
      RAISE EXCEPTION 'import row % maker and sku must be plain text of at most 200 characters', p_ordinal
        USING ERRCODE = 'check_violation';
    END IF;
  END LOOP;
  IF v_currency IS NOT NULL AND v_currency !~ '^[A-Z]{3}$' THEN
    RAISE EXCEPTION 'import row % currency must be an uppercase ISO-4217 code', p_ordinal
      USING ERRCODE = 'check_violation';
  END IF;
  IF (v_price IS NULL) <> (v_currency IS NULL) THEN
    RAISE EXCEPTION 'import row % price and currency are confirmed together', p_ordinal
      USING ERRCODE = 'check_violation';
  END IF;
  IF (v_price IS NULL AND v_basis IS NOT NULL)
     OR (v_price IS NOT NULL AND v_basis IS DISTINCT FROM 'client' AND v_basis IS DISTINCT FROM 'trade')
  THEN
    RAISE EXCEPTION 'import row % a confirmed price needs priceBasis client or trade', p_ordinal
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN jsonb_build_object(
    'maker', v_maker,
    'sku', v_sku,
    'unitPriceMinor', v_price,
    'currency', v_currency,
    'priceBasis', v_basis
  );
END;
$$;

-- ── F5: the staging wrapper (00661 body; the `reused` check is the delta) ──
-- 00660 rewrites the impl. A body that stops returning `reused` now fails the
-- staging call instead of silently skipping the confirmation flags.
CREATE OR REPLACE FUNCTION public.stage_project_ffe_document_extraction(
  p_project_id uuid,
  p_asset_id uuid,
  p_actor_id uuid,
  p_file_hash text,
  p_rows jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_result jsonb;
  v_row public.project_ffe_import_rows%ROWTYPE;
  v_commercial jsonb;
  v_errors jsonb;
BEGIN
  v_result := public._stage_project_ffe_document_extraction_00661_impl(
    p_project_id, p_asset_id, p_actor_id, p_file_hash, p_rows
  );

  IF jsonb_typeof(v_result -> 'reused') IS DISTINCT FROM 'boolean' THEN
    RAISE EXCEPTION 'document extraction staging did not report whether the batch was reused';
  END IF;
  IF NOT (v_result ->> 'reused')::boolean THEN
    FOR v_row IN
      SELECT * FROM public.project_ffe_import_rows
      WHERE batch_id = (v_result ->> 'batchId')::uuid
      ORDER BY row_ordinal
    LOOP
      v_commercial := public._ffe_extracted_commercial(v_row.raw_row, v_row.row_ordinal);
      v_errors := v_row.validation_errors;
      IF NOT v_errors ? 'formula_like_value' AND public._ffe_has_formula_like_text(v_row.raw_row) THEN
        v_errors := v_errors || jsonb_build_array('formula_like_value');
      END IF;
      IF v_commercial IS NOT NULL THEN
        v_errors := v_errors || jsonb_build_array('unconfirmed_commercial_value');
      END IF;
      UPDATE public.project_ffe_import_rows SET
        normalized_row = CASE WHEN v_commercial IS NULL THEN normalized_row
          ELSE normalized_row || jsonb_build_object('commercial', v_commercial) END,
        validation_errors = v_errors
      WHERE id = v_row.id;
    END LOOP;
  END IF;

  RETURN v_result || jsonb_build_object(
    'unconfirmedCommercialRows',
    (SELECT count(*) FROM public.project_ffe_import_rows
     WHERE batch_id = (v_result ->> 'batchId')::uuid
       AND validation_errors ? 'unconfirmed_commercial_value')
  );
END;
$$;

-- ── F3 + F8: the commit wrapper (00661 body; two refusals are the delta) ───
CREATE OR REPLACE FUNCTION public.commit_project_ffe_import(
  p_batch_id uuid, p_decisions jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $$
DECLARE
  v_batch public.project_ffe_import_batches%ROWTYPE;
  v_decision jsonb;
  v_row public.project_ffe_import_rows%ROWTYPE;
  v_placed jsonb;
  v_commercial jsonb;
  v_response jsonb;
  v_replayed integer[] := '{}';
BEGIN
  IF jsonb_typeof(p_decisions) IS DISTINCT FROM 'array' OR EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_decisions) decision
    WHERE decision->>'rowOrdinal' !~ '^[1-9][0-9]{0,9}$'
       OR (decision->>'rowOrdinal')::numeric > 2147483647
  ) THEN
    RAISE EXCEPTION 'import rowOrdinal must be a positive 32-bit integer'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_batch FROM public.project_ffe_import_batches WHERE id = p_batch_id FOR UPDATE;
  IF FOUND AND v_batch.status = 'staged' THEN
    PERFORM public._ffe_require_studio_project(v_batch.project_id);
    FOR v_decision IN
      SELECT value FROM jsonb_array_elements(p_decisions) WHERE jsonb_typeof(value) = 'object' AND value ? 'commercial'
    LOOP
      UPDATE public.project_ffe_import_rows SET
        commercial_decision = public._ffe_import_commercial_decision(
          v_decision -> 'commercial', (v_decision ->> 'rowOrdinal')::integer
        ),
        validation_errors = COALESCE((
          SELECT jsonb_agg(error) FROM jsonb_array_elements(validation_errors) error
          WHERE error #>> '{}' <> 'unconfirmed_commercial_value'
        ), '[]'::jsonb)
      WHERE batch_id = v_batch.id AND row_ordinal = (v_decision ->> 'rowOrdinal')::integer;
    END LOOP;
    -- F8: the impl places each row under key import:<batch>:<ordinal> for this
    -- actor (00439). A staged batch has never committed, so a key that exists
    -- now came from an earlier direct placement, and its replay would report
    -- 'created' for a selection this commit did not create.
    SELECT COALESCE(array_agg(row.row_ordinal), '{}') INTO v_replayed
    FROM public.project_ffe_import_rows row
    WHERE row.batch_id = v_batch.id AND row.commercial_decision IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.project_ffe_command_idempotency command
        WHERE command.actor_id = auth.uid()
          AND command.idempotency_key = 'import:' || v_batch.id::text || ':' || row.row_ordinal::text
      );
  END IF;

  v_response := public._commit_project_ffe_import_00446_impl(p_batch_id, p_decisions);

  IF v_batch.status = 'staged' THEN
    FOR v_row IN
      SELECT * FROM public.project_ffe_import_rows
      WHERE batch_id = v_batch.id AND commercial_decision IS NOT NULL
      ORDER BY row_ordinal
    LOOP
      SELECT result INTO v_placed
      FROM jsonb_array_elements(v_response -> 'results') result
      WHERE (result ->> 'rowOrdinal')::integer = v_row.row_ordinal;
      CONTINUE WHEN v_placed ->> 'outcome' = 'held';
      IF v_placed ->> 'outcome' IS DISTINCT FROM 'created' OR v_row.row_ordinal = ANY(v_replayed) THEN
        RAISE EXCEPTION 'import row % confirmed commercial values would overwrite an existing selection', v_row.row_ordinal
          USING ERRCODE = 'check_violation';
      END IF;
      v_commercial := v_row.commercial_decision;
      -- F3: a selection placed from a catalog product carries that product's
      -- USD prices in every price column; one confirmed column cannot relabel
      -- the row.
      IF COALESCE(v_commercial ->> 'currency', 'USD') <> 'USD' AND EXISTS (
        SELECT 1 FROM public.project_ffe_items
        WHERE id = v_row.committed_ffe_item_id AND product_id IS NOT NULL
      ) THEN
        RAISE EXCEPTION 'import row % is priced from a catalog product in USD; a confirmed price in % is refused',
          v_row.row_ordinal, v_commercial ->> 'currency'
          USING ERRCODE = 'check_violation';
      END IF;
      UPDATE public.project_ffe_items SET
        vendor_name = COALESCE(v_commercial ->> 'maker', vendor_name),
        unit_price_cents = CASE WHEN v_commercial ->> 'priceBasis' = 'client'
          THEN (v_commercial ->> 'unitPriceMinor')::integer ELSE unit_price_cents END,
        line_total_cents = CASE WHEN v_commercial ->> 'priceBasis' = 'client'
          THEN quantity * (v_commercial ->> 'unitPriceMinor')::integer ELSE line_total_cents END,
        trade_price_cents = CASE WHEN v_commercial ->> 'priceBasis' = 'trade'
          THEN (v_commercial ->> 'unitPriceMinor')::integer ELSE trade_price_cents END,
        currency = COALESCE(v_commercial ->> 'currency', currency),
        updated_at = now()
      WHERE id = v_row.committed_ffe_item_id;
      IF v_commercial ->> 'sku' IS NOT NULL THEN
        UPDATE public.project_ffe_specs SET sku = v_commercial ->> 'sku'
        WHERE ffe_item_id = v_row.committed_ffe_item_id;
      END IF;
    END LOOP;
  END IF;

  RETURN v_response;
END;
$$;

-- ── F4: placement (00435 body, renamed by 00439; the fill sets currency) ───
CREATE OR REPLACE FUNCTION public._place_product_in_project_v2_00438_impl(p_request jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_project_id uuid := NULLIF(p_request->>'projectId', '')::uuid;
  v_product_id uuid := NULLIF(p_request->>'productId', '')::uuid;
  v_room_id uuid := NULLIF(p_request->>'roomId', '')::uuid;
  v_board_id uuid := NULLIF(p_request->>'boardId', '')::uuid;
  v_placeholder_id uuid := NULLIF(p_request->>'placeholderSelectionId', '')::uuid;
  v_reference_id uuid := NULLIF(p_request->>'selectionReferenceId', '')::uuid;
  v_thread_id uuid := NULLIF(p_request->>'selectionThreadId', '')::uuid;
  v_configuration_id uuid := NULLIF(p_request->>'configurationId', '')::uuid;
  v_assignment text := COALESCE(NULLIF(p_request->>'assignmentScope', ''), 'unassigned');
  v_disposition text := COALESCE(NULLIF(p_request->>'disposition', ''), 'candidate');
  v_duplicate text := COALESCE(NULLIF(p_request->>'duplicateMode', ''), 'reuse');
  v_key text := NULLIF(btrim(p_request->>'idempotencyKey'), '');
  v_hash text;
  v_existing_hash text;
  v_response jsonb;
  v_product public.products%ROWTYPE;
  v_item public.project_ffe_items%ROWTYPE;
  v_board public.proposal_boards%ROWTYPE;
  v_vendor_name text;
  v_placement_id uuid;
  v_inserted integer;
  v_outcome text;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'authentication required' USING ERRCODE = 'insufficient_privilege'; END IF;
  IF p_request IS NULL OR jsonb_typeof(p_request) <> 'object' OR v_project_id IS NULL THEN
    RAISE EXCEPTION 'placement request must name a project' USING ERRCODE = 'check_violation';
  END IF;
  PERFORM public._ffe_require_studio_project(v_project_id);
  IF v_key IS NULL OR char_length(v_key) > 200 THEN
    RAISE EXCEPTION 'idempotencyKey is required and must be at most 200 characters'
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_assignment NOT IN ('room', 'throughout', 'unassigned')
     OR v_disposition NOT IN ('candidate', 'selected', 'alternate', 'not_selected')
     OR v_duplicate NOT IN ('reuse', 'create', 'hold')
  THEN RAISE EXCEPTION 'invalid placement routing choice' USING ERRCODE = 'check_violation'; END IF;
  IF (v_assignment = 'room') <> (v_room_id IS NOT NULL) THEN
    RAISE EXCEPTION 'room assignment requires exactly one project room'
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_room_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.project_rooms room WHERE room.id = v_room_id AND room.project_id = v_project_id
  ) THEN RAISE EXCEPTION 'room does not belong to project' USING ERRCODE = 'integrity_constraint_violation'; END IF;

  v_hash := encode(extensions.digest(p_request::text, 'sha256'), 'hex');
  INSERT INTO public.project_ffe_command_idempotency(actor_id, idempotency_key, request_hash)
  VALUES (v_actor, v_key, v_hash) ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  IF v_inserted = 0 THEN
    SELECT request_hash, response INTO v_existing_hash, v_response
    FROM public.project_ffe_command_idempotency
    WHERE actor_id = v_actor AND idempotency_key = v_key FOR UPDATE;
    IF v_existing_hash <> v_hash THEN
      RAISE EXCEPTION 'idempotency key was used for a different request'
        USING ERRCODE = 'unique_violation';
    END IF;
    IF v_response IS NULL THEN
      RAISE EXCEPTION 'idempotent command is still in progress'
        USING ERRCODE = 'serialization_failure';
    END IF;
    RETURN v_response;
  END IF;

  IF v_duplicate = 'hold' THEN
    v_response := jsonb_build_object('outcome', 'held', 'projectId', v_project_id);
    UPDATE public.project_ffe_command_idempotency SET response = v_response
    WHERE actor_id = v_actor AND idempotency_key = v_key;
    RETURN v_response;
  END IF;

  IF v_product_id IS NOT NULL THEN
    SELECT * INTO v_product FROM public.products WHERE id = v_product_id;
    IF NOT FOUND OR v_product.deleted_at IS NOT NULL OR v_product.merged_into_id IS NOT NULL OR NOT (
      v_product.layer = 'catalog'
      OR (v_product.layer = 'personal' AND v_product.owner_user_id = v_actor)
      OR (v_product.layer = 'studio' AND EXISTS (
        SELECT 1 FROM public.organization_members member
        WHERE member.organization_id = v_product.studio_id
          AND member.user_id = v_actor AND member.status = 'active'
      ))
    ) THEN RAISE EXCEPTION 'product not found or not accessible' USING ERRCODE = 'insufficient_privilege'; END IF;
    SELECT name INTO v_vendor_name FROM public.vendors WHERE id = v_product.vendor_id;
  END IF;

  IF v_reference_id IS NOT NULL THEN
    SELECT * INTO v_item FROM public.project_ffe_items
    WHERE id = v_reference_id AND project_id = v_project_id AND removed_at IS NULL FOR UPDATE;
    IF NOT FOUND OR (v_product_id IS NOT NULL AND v_item.product_id IS DISTINCT FROM v_product_id) THEN
      RAISE EXCEPTION 'selection reference does not match the project/product'
        USING ERRCODE = 'integrity_constraint_violation';
    END IF;
    v_outcome := 'reused';
  ELSIF v_placeholder_id IS NOT NULL THEN
    SELECT * INTO v_item FROM public.project_ffe_items
    WHERE id = v_placeholder_id AND project_id = v_project_id FOR UPDATE;
    IF NOT FOUND OR v_item.product_id IS NOT NULL OR v_product_id IS NULL THEN
      RAISE EXCEPTION 'placeholder is unavailable or already filled'
        USING ERRCODE = 'integrity_constraint_violation';
    END IF;
    PERFORM set_config('app.ffe_mutation_rpc', 'on', true);
    UPDATE public.project_ffe_items SET
      product_id = v_product.id,
      name = v_product.name,
      ffe_category = COALESCE(NULLIF(btrim(p_request->>'category'), ''), v_product.category, ffe_category),
      project_room_id = v_room_id,
      assignment_scope = v_assignment,
      design_disposition = v_disposition,
      vendor_id = v_product.vendor_id,
      vendor_name = v_vendor_name,
      trade_price_cents = COALESCE(v_product.price_trade, v_product.price_retail, 0),
      unit_price_cents = COALESCE(v_product.price_retail, v_product.price_trade, 0),
      line_total_cents = quantity * COALESCE(v_product.price_retail, v_product.price_trade, 0),
      currency = 'USD',
      updated_at = now()
    WHERE id = v_item.id RETURNING * INTO v_item;
    v_outcome := 'filled';
  ELSE
    IF v_duplicate = 'reuse' AND v_product_id IS NOT NULL THEN
      SELECT * INTO v_item FROM public.project_ffe_items
      WHERE project_id = v_project_id AND product_id = v_product_id
        AND removed_at IS NULL AND design_disposition NOT IN ('not_selected', 'superseded')
        AND assignment_scope = v_assignment
        AND project_room_id IS NOT DISTINCT FROM v_room_id
      ORDER BY created_at, id LIMIT 1 FOR UPDATE;
    END IF;
    IF v_item.id IS NOT NULL THEN
      v_outcome := 'reused';
    ELSE
      PERFORM set_config('app.ffe_mutation_rpc', 'on', true);
      INSERT INTO public.project_ffe_items (
        project_id, project_room_id, product_id, name, ffe_category,
        quantity, trade_price_cents, unit_price_cents, line_total_cents,
        vendor_id, vendor_name, added_via, sort_order, selection_thread_id,
        design_disposition, assignment_scope
      ) VALUES (
        v_project_id, v_room_id, v_product_id,
        COALESCE(v_product.name, NULLIF(btrim(p_request->>'name'), ''), 'Named need'),
        COALESCE(NULLIF(btrim(p_request->>'category'), ''), v_product.category),
        COALESCE(NULLIF(p_request->>'quantity', '')::integer, 1),
        CASE WHEN v_product_id IS NULL THEN NULL ELSE COALESCE(v_product.price_trade, v_product.price_retail, 0) END,
        CASE WHEN v_product_id IS NULL THEN 0 ELSE COALESCE(v_product.price_retail, v_product.price_trade, 0) END,
        CASE WHEN v_product_id IS NULL THEN 0 ELSE COALESCE(NULLIF(p_request->>'quantity', '')::integer, 1) * COALESCE(v_product.price_retail, v_product.price_trade, 0) END,
        v_product.vendor_id, v_vendor_name,
        COALESCE(NULLIF(p_request->>'source', ''), 'project-add'),
        COALESCE((SELECT max(sort_order) + 1 FROM public.project_ffe_items WHERE project_id = v_project_id), 0),
        v_thread_id, v_disposition, v_assignment
      ) RETURNING * INTO v_item;
      v_outcome := 'created';
    END IF;
  END IF;

  IF v_configuration_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.product_configurations configuration
      WHERE configuration.id = v_configuration_id
        AND configuration.product_id = v_item.product_id
        AND (configuration.project_id IS NULL OR configuration.project_id = v_project_id)
        AND configuration.is_valid
    ) THEN RAISE EXCEPTION 'configuration does not match the placed product/project' USING ERRCODE = 'integrity_constraint_violation'; END IF;
  END IF;
  INSERT INTO public.project_ffe_specs(ffe_item_id, routing_source, updated_by, configuration_id)
  VALUES (
    v_item.id,
    COALESCE(p_request->'sourceMetadata', '{}'::jsonb)
      || jsonb_strip_nulls(jsonb_build_object('captureId', p_request->>'captureId')),
    v_actor,
    v_configuration_id
  )
  ON CONFLICT (ffe_item_id) DO UPDATE SET
    routing_source = project_ffe_specs.routing_source || EXCLUDED.routing_source,
    updated_by = v_actor,
    configuration_id = COALESCE(EXCLUDED.configuration_id, project_ffe_specs.configuration_id);

  IF v_board_id IS NOT NULL THEN
    SELECT * INTO v_board FROM public.proposal_boards
    WHERE id = v_board_id AND project_id = v_project_id AND proposal_id IS NULL FOR UPDATE;
    IF NOT FOUND OR (v_board.project_room_id IS NOT NULL
       AND v_item.assignment_scope = 'room'
       AND v_board.project_room_id <> v_item.project_room_id)
    THEN RAISE EXCEPTION 'board is not compatible with the project assignment' USING ERRCODE = 'integrity_constraint_violation'; END IF;
    PERFORM set_config('app.board_state_rpc', 'on', true);
    INSERT INTO public.proposal_board_items (
      board_id, type, x, y, width, product_id, image_url, data, project_ffe_item_id
    ) VALUES (
      v_board_id, CASE WHEN v_item.product_id IS NULL THEN 'note' ELSE 'product' END,
      COALESCE(NULLIF(p_request#>>'{placement,x}', '')::numeric, 0),
      COALESCE(NULLIF(p_request#>>'{placement,y}', '')::numeric, 0),
      COALESCE(NULLIF(p_request#>>'{placement,width}', '')::numeric, 240),
      v_item.product_id, CASE WHEN v_product_id IS NULL THEN NULL ELSE v_product.images[1] END,
      jsonb_strip_nulls(jsonb_build_object('name', v_item.name, 'section_id', p_request#>>'{placement,sectionId}')),
      v_item.id
    ) RETURNING id INTO v_placement_id;
  END IF;

  v_response := jsonb_strip_nulls(jsonb_build_object(
    'outcome', v_outcome,
    'projectId', v_project_id,
    'selectionId', v_item.id,
    'threadId', v_item.selection_thread_id,
    'placementId', v_placement_id,
    'productId', v_item.product_id,
    'assignmentScope', v_item.assignment_scope,
    'roomId', v_item.project_room_id
  ));
  UPDATE public.project_ffe_command_idempotency SET response = v_response
  WHERE actor_id = v_actor AND idempotency_key = v_key;
  RETURN v_response;
END;
$$;

-- ── F4: client decision apply (00464 body; the feed-through sets currency) ─
CREATE OR REPLACE FUNCTION public._apply_client_decision_authorized(
  p_decision_id uuid,
  p_selected_option_id uuid,
  p_actor uuid,
  p_client_consent_method text DEFAULT NULL,
  p_client_signature text DEFAULT NULL,
  p_client_note text DEFAULT NULL,
  p_quantity integer DEFAULT NULL
)
RETURNS public.client_decisions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_decision public.client_decisions%ROWTYPE;
  v_option public.client_decision_options%ROWTYPE;
  v_receipt public.project_approval_action_receipts%ROWTYPE;
  v_selected_option_id uuid;
  v_selected_outcome text;
  v_requested_signature text := NULLIF(
    btrim(COALESCE(p_client_signature, '')), ''
  );
  v_stored_signature text;
  v_room_id uuid;
  v_trade_price integer;
  v_markup numeric(5,2);
BEGIN
  SELECT * INTO v_decision
  FROM public.client_decisions
  WHERE id = p_decision_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'decision % not found', p_decision_id
      USING ERRCODE = 'no_data_found';
  END IF;

  IF v_decision.approval_contract = 'project_artifact_v1' THEN
    IF p_actor IS DISTINCT FROM auth.uid()
       OR p_client_note IS NOT NULL
       OR (p_quantity IS NOT NULL AND p_quantity <> 1)
    THEN
      RAISE EXCEPTION
        'Stage-2 installed option response cannot carry comment or quantity evidence'
        USING ERRCODE = 'check_violation';
    END IF;

    IF v_decision.status = 'responded' THEN
      SELECT option.id, option.approval_outcome
      INTO v_selected_option_id, v_selected_outcome
      FROM public.client_decision_options AS option
      WHERE option.decision_id = p_decision_id
        AND option.selected
      ORDER BY option.id
      LIMIT 1;
      IF v_selected_option_id IS DISTINCT FROM p_selected_option_id THEN
        RAISE EXCEPTION 'decision % was already resolved with another option',
          p_decision_id
          USING ERRCODE = 'serialization_failure';
      END IF;

      SELECT * INTO v_receipt
      FROM public.project_approval_action_receipts AS receipt
      WHERE receipt.decision_id = p_decision_id
        AND receipt.action_kind = 'responded'
        AND receipt.idempotency_key =
            'installed-option:' || p_selected_option_id::text;
      v_stored_signature := NULLIF(
        btrim(COALESCE(v_decision.client_signature, '')), ''
      );
      IF v_receipt.id IS NULL
         OR v_receipt.actor_id IS DISTINCT FROM p_actor
         OR v_receipt.project_id IS DISTINCT FROM v_decision.project_id
         OR v_receipt.result->>'decisionId' IS DISTINCT FROM p_decision_id::text
         OR v_receipt.result->>'projectId' IS DISTINCT FROM v_decision.project_id::text
         OR v_receipt.result->>'optionId' IS DISTINCT FROM p_selected_option_id::text
         OR v_receipt.result->>'outcome' IS DISTINCT FROM v_selected_outcome
         OR v_decision.selected_by IS DISTINCT FROM p_actor
         OR v_decision.answered_by IS DISTINCT FROM p_actor
         OR v_decision.answer IS DISTINCT FROM v_selected_outcome
         OR p_client_consent_method IS DISTINCT FROM
            v_decision.client_consent_method
         OR v_requested_signature IS DISTINCT FROM v_stored_signature
      THEN
        RAISE EXCEPTION
          'installed Stage-2 response replay conflicts with immutable evidence'
          USING ERRCODE = 'unique_violation';
      END IF;
      RETURN v_decision;
    END IF;

    PERFORM public._respond_project_approval_checked(
      p_decision_id, NULL, p_selected_option_id, v_decision.updated_at,
      'installed-option:' || p_selected_option_id::text,
      p_client_consent_method, p_client_signature
    );
    SELECT * INTO STRICT v_decision
    FROM public.client_decisions
    WHERE id = p_decision_id;
    RETURN v_decision;
  END IF;

  -- Deterministic replay: repeating the same winning option returns the same
  -- terminal row; trying to overwrite a different winner is a stale conflict.
  IF v_decision.status = 'responded' THEN
    SELECT id INTO v_selected_option_id
    FROM public.client_decision_options
    WHERE decision_id = p_decision_id AND selected = true
    ORDER BY id
    LIMIT 1;
    IF v_selected_option_id IS NOT DISTINCT FROM p_selected_option_id THEN
      PERFORM public._enqueue_decision_notification(
        p_decision_id, 'decision_resolved'
      );
      RETURN v_decision;
    END IF;
    RAISE EXCEPTION 'decision % was already resolved with another option', p_decision_id
      USING ERRCODE = 'serialization_failure';
  END IF;

  IF v_decision.status <> 'pending' THEN
    RAISE EXCEPTION 'decision % cannot be applied from status %',
      p_decision_id, v_decision.status
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM 1
  FROM public.client_decision_options
  WHERE decision_id = p_decision_id
  ORDER BY id
  FOR UPDATE;

  SELECT * INTO v_option
  FROM public.client_decision_options
  WHERE id = p_selected_option_id
    AND decision_id = p_decision_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'option % does not belong to decision %',
      p_selected_option_id, p_decision_id
      USING ERRCODE = 'check_violation';
  END IF;

  IF p_quantity IS NOT NULL AND p_quantity < 1 THEN
    RAISE EXCEPTION 'decision option quantity must be at least 1'
      USING ERRCODE = 'check_violation';
  END IF;
  IF p_client_consent_method IS NOT NULL
     AND p_client_consent_method NOT IN ('electronic_signature', 'click_through')
  THEN
    RAISE EXCEPTION 'invalid client consent method %', p_client_consent_method
      USING ERRCODE = 'check_violation';
  END IF;
  IF p_client_consent_method = 'electronic_signature'
     AND char_length(btrim(COALESCE(p_client_signature, ''))) < 2
  THEN
    RAISE EXCEPTION 'an electronic signature of at least 2 characters is required'
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM set_config('app.client_decision_write_id', p_decision_id::text, true);

  UPDATE public.client_decision_options
  SET selected = (id = p_selected_option_id),
      client_note = CASE WHEN id = p_selected_option_id
        THEN COALESCE(p_client_note, client_note) ELSE client_note END,
      quantity = CASE WHEN id = p_selected_option_id
        THEN COALESCE(p_quantity, quantity) ELSE quantity END
  WHERE decision_id = p_decision_id;

  SELECT * INTO v_option
  FROM public.client_decision_options
  WHERE id = p_selected_option_id;

  UPDATE public.client_decisions
  SET status = 'responded',
      responded_at = now(),
      selected_by = p_actor,
      client_consent_method = p_client_consent_method,
      client_signature = CASE WHEN p_client_consent_method IS NULL
        THEN NULL ELSE NULLIF(btrim(COALESCE(p_client_signature, '')), '') END,
      client_consented_at = CASE WHEN p_client_consent_method IS NULL
        THEN NULL ELSE now() END,
      updated_at = now()
  WHERE id = p_decision_id
  RETURNING * INTO v_decision;

  UPDATE public.project_ffe_items
  SET blocked = false,
      blocked_reason = NULL,
      blocked_by_decision_id = NULL,
      last_status_change_at = now(),
      updated_at = now()
  WHERE blocked_by_decision_id = p_decision_id
    AND project_id = v_decision.project_id;

  -- Preserve 00175/00185's one-line-per-decision dual-pricing feed-through.
  IF v_decision.project_id IS NOT NULL
     AND v_option.product_id IS NOT NULL
     AND v_decision.blocking_status = 'non_blocking'
  THEN
    v_room_id := (
      SELECT room.id
      FROM public.project_rooms AS room
      WHERE room.id = v_decision.room_id
        AND room.project_id = v_decision.project_id
    );

    SELECT product.price_trade INTO v_trade_price
    FROM public.products AS product
    WHERE product.id = v_option.product_id;

    IF v_trade_price IS NULL OR v_trade_price < 0 THEN
      v_trade_price := GREATEST(COALESCE(v_option.price, 0), 0);
      v_markup := 0;
    ELSIF v_trade_price > 0
          AND COALESCE(v_option.price, 0) > v_trade_price
    THEN
      v_markup := LEAST(
        round(((COALESCE(v_option.price, 0)::numeric / v_trade_price) - 1) * 100, 2),
        999.99
      );
    ELSE
      v_markup := 0;
    END IF;

    UPDATE public.project_ffe_items
    SET product_id = v_option.product_id,
        name = v_option.name,
        project_room_id = v_room_id,
        quantity = COALESCE(v_option.quantity, 1),
        unit_price_cents = COALESCE(v_option.price, 0),
        trade_price_cents = v_trade_price,
        markup_percent = v_markup,
        line_total_cents = COALESCE(v_option.price, 0)
          * COALESCE(v_option.quantity, 1),
        currency = 'USD',
        updated_at = now()
    WHERE source_decision_id = p_decision_id;

    IF NOT FOUND THEN
      INSERT INTO public.project_ffe_items (
        project_id, project_room_id, product_id, source_decision_id,
        name, item_type, status, quantity, unit_price_cents,
        trade_price_cents, markup_percent, line_total_cents
      ) VALUES (
        v_decision.project_id, v_room_id, v_option.product_id, p_decision_id,
        v_option.name, 'fixed', 'specified', COALESCE(v_option.quantity, 1),
        COALESCE(v_option.price, 0), v_trade_price, v_markup,
        COALESCE(v_option.price, 0) * COALESCE(v_option.quantity, 1)
      );
    END IF;

    IF jsonb_typeof(v_option.selection_snapshot) = 'array'
       AND jsonb_array_length(v_option.selection_snapshot) > 0
    THEN
      UPDATE public.project_ffe_specs AS spec
      SET material = COALESCE((
            SELECT string_agg(chosen.selection->>'valueLabel', ', '
                              ORDER BY chosen.ordinality)
            FROM jsonb_array_elements(v_option.selection_snapshot)
                 WITH ORDINALITY AS chosen(selection, ordinality)
            WHERE lower(chosen.selection->>'groupCode') = 'material'
          ), spec.material),
          finish = COALESCE((
            SELECT string_agg(chosen.selection->>'valueLabel', ', '
                              ORDER BY chosen.ordinality)
            FROM jsonb_array_elements(v_option.selection_snapshot)
                 WITH ORDINALITY AS chosen(selection, ordinality)
            WHERE lower(chosen.selection->>'groupCode') = 'finish'
          ), spec.finish),
          color_fabric = COALESCE((
            SELECT string_agg(chosen.selection->>'valueLabel', ', '
                              ORDER BY chosen.ordinality)
            FROM jsonb_array_elements(v_option.selection_snapshot)
                 WITH ORDINALITY AS chosen(selection, ordinality)
            WHERE lower(chosen.selection->>'groupCode')
                  IN ('color', 'colour', 'fabric', 'color_fabric', 'upholstery')
          ), spec.color_fabric),
          updated_at = now()
      WHERE spec.ffe_item_id IN (
              SELECT item.id
              FROM public.project_ffe_items AS item
              WHERE item.source_decision_id = p_decision_id
                AND item.project_id = v_decision.project_id
            )
        AND spec.configuration_locked_at IS NULL;
    END IF;
  END IF;

  PERFORM set_config('app.client_decision_write_id', '', true);
  PERFORM public._enqueue_decision_notification(
    p_decision_id, 'decision_resolved'
  );
  RETURN v_decision;
END;
$$;

REVOKE ALL ON FUNCTION public._ffe_guard_usd_invoice_line()
FROM PUBLIC, anon, authenticated, service_role;
