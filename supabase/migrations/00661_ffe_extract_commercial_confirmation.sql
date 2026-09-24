-- ═══════════════════════════════════════════════════════════════════════════
-- 00661 — The extractor may read maker, SKU, price and currency; nothing it
--         reads reaches a selection until a designer confirms that row
-- Lineage:
--   stage_project_ffe_document_extraction  00437 (→ 00660 if the image branch
--     lands first). NOT redefined here: the current body is renamed to
--     _stage_project_ffe_document_extraction_00661_impl and wrapped, so this
--     file carries no copy of it and cannot revert whichever body is current.
--   commit_project_ffe_import  00435 → 00439 (renamed to
--     _commit_project_ffe_import_00446_impl by 00447) → 00447 wrapper → here.
--     The 00447 wrapper body is copied verbatim; the delta is grafted after
--     its rowOrdinal check. The 00439 impl is untouched.
--   supersede_project_selection  00439 → here. 00439 body verbatim; the delta
--     adds `currency` to the successor insert (carried with carried prices,
--     'USD' when a replacement product supplies them), so superseding a EUR
--     selection cannot silently re-denominate its prices as USD.
--   derive_working_budget_draft  00422 → 00423 → renamed here to
--     _derive_working_budget_draft_00661_impl and wrapped (body untouched).
--   publish_budget_checkpoint  00412 → 00414 → 00422 → 00423 → 00578 →
--     renamed here to _publish_budget_checkpoint_00661_impl and wrapped.
-- Reconciles: the formula guard at 00437:239-244 scans jsonb_each_text(row),
--   which yields an object's JSON text ("{...}"), so once maker/sku/price/
--   currency travel as envelopes the ^[=+@] test silently covers nothing.
--   The wrapper re-runs the guard over every string leaf of the row.
--
-- Rulings: D7 (extractor reads maker, SKU, price and currency, each with
--   per-row confirmation) and D7a (a currency column on project_ffe_items,
--   ISO-4217, default USD). Contract: artifacts/ios27-delivery-plan-2026-09-23/
--   execute/contracts/CONTRACT-A-extractor.md §A.4–A.8.
--
-- Shape:
--   1. project_ffe_items.currency — text NOT NULL DEFAULT 'USD', three
--      uppercase letters. Every existing row is USD, which is what the
--      unqualified *_cents columns have always meant.
--   2. project_ffe_import_rows.commercial_decision — the designer's confirmed
--      values for one row, written only by commit_project_ffe_import from its
--      p_decisions. The model's reading stays in raw_row and in
--      normalized_row.commercial; the two never share a column.
--   3. Staging: a row carrying any commercial envelope gets
--      normalized_row.commercial and validation_errors +=
--      'unconfirmed_commercial_value'. 00439's existing gate refuses to commit
--      a batch with any validation error, so the refusal needs no new gate.
--      A bare scalar, a state other than 'unconfirmed', or a priceBasis other
--      than 'unknown' rejects the whole staging call.
--   4. Commit: a decision's `commercial` object (all five keys, each value the
--      designer's bare scalar or null) clears that row's error. After
--      placement, a row whose selection was CREATED by this commit receives
--      the confirmed values: maker -> vendor_name, sku -> project_ffe_specs.sku,
--      unitPriceMinor -> unit_price_cents (priceBasis 'client', with
--      line_total_cents) or trade_price_cents (priceBasis 'trade'), currency ->
--      currency. A held row places nothing, so nothing is written. A reused
--      selection is refused rather than repriced.
--   The placement payload (00439:558-566) is not widened: it still carries no
--   price or vendor field, so an extracted value cannot reach project_ffe_items.
--   5. Totals never add across currencies. purchase_orders,
--      furnishing_authorization_items and project_budget_lines carry no
--      currency, so a non-USD selection is refused where it would enter one:
--      a trigger on the PO link, a trigger on the authorization line, and a
--      guard after the two working-budget rollups. Ordering, authorizing or
--      budgeting a non-USD selection awaits a ruling on those documents.
--
-- Grants: new helpers and the renamed impl are REVOKEd from every role; the
--   two public entry points keep their 00444/00447 grants (service_role for
--   staging, authenticated for commit); the two budget wrappers get 00423's
--   (authenticated only). supersede_project_selection keeps its ACL (CREATE OR
--   REPLACE). seed/00-legacy-grants.sql
--   is regenerated: its baseline grants EXECUTE on every public function, so
--   without the replayed REVOKEs a fresh local stack would expose the helpers
--   and the renamed impl.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.project_ffe_items
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'USD'
    CONSTRAINT project_ffe_items_currency_iso4217 CHECK (currency ~ '^[A-Z]{3}$');

COMMENT ON COLUMN public.project_ffe_items.currency IS
  'ISO-4217 currency of unit_price_cents, trade_price_cents and '
  'line_total_cents (00661, ruling D7a). The *_cents columns are minor units '
  'of this currency. Totals must never add across currencies.';

ALTER TABLE public.project_ffe_import_rows
  ADD COLUMN IF NOT EXISTS commercial_decision jsonb
    CONSTRAINT project_ffe_import_rows_commercial_decision_object
    CHECK (commercial_decision IS NULL OR jsonb_typeof(commercial_decision) = 'object');

COMMENT ON COLUMN public.project_ffe_import_rows.commercial_decision IS
  'The designer''s confirmed maker/sku/unitPriceMinor/currency/priceBasis for '
  'this row, written only by commit_project_ffe_import (00661). The model''s '
  'unconfirmed reading lives in raw_row and normalized_row.commercial.';

-- True when any string anywhere in the value looks like a spreadsheet formula
-- or a command-line flag. Walks nested objects, so an envelope's scalar is
-- inspected rather than the envelope's JSON text.
CREATE OR REPLACE FUNCTION public._ffe_has_formula_like_text(p_value jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM jsonb_path_query(p_value, 'strict $.**') AS leaf
    WHERE jsonb_typeof(leaf) = 'string'
      AND ((leaf #>> '{}') ~ '^[=+@]' OR (leaf #>> '{}') ~ '^-[A-Za-z]')
  );
$$;

-- The extracted commercial envelopes of one staged row, or NULL when the row
-- carries none. Raises when a commercial field is anything but JSON null or a
-- {value, confidence, state:'unconfirmed'} envelope.
CREATE OR REPLACE FUNCTION public._ffe_extracted_commercial(p_row jsonb, p_ordinal integer)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_key text;
  v_envelope jsonb;
  v_commercial jsonb := '{}'::jsonb;
BEGIN
  IF jsonb_typeof(p_row) IS DISTINCT FROM 'object' THEN
    RETURN NULL;
  END IF;
  FOREACH v_key IN ARRAY ARRAY['maker', 'sku', 'unitPriceMinor', 'currency'] LOOP
    v_envelope := p_row -> v_key;
    CONTINUE WHEN v_envelope IS NULL OR jsonb_typeof(v_envelope) = 'null';
    IF jsonb_typeof(v_envelope) <> 'object'
       OR (SELECT count(*) FROM jsonb_object_keys(v_envelope)) <> 3
       OR NOT v_envelope ?& ARRAY['value', 'confidence', 'state']
       OR v_envelope -> 'state' IS DISTINCT FROM '"unconfirmed"'::jsonb
       OR jsonb_typeof(v_envelope -> 'value') NOT IN ('string', 'number')
       OR (CASE WHEN jsonb_typeof(v_envelope -> 'confidence') = 'number'
             THEN (v_envelope ->> 'confidence')::numeric NOT BETWEEN 0 AND 1
             ELSE true END)
    THEN
      RAISE EXCEPTION 'document extraction row % carries a malformed commercial value', p_ordinal
        USING ERRCODE = 'check_violation';
    END IF;
    v_commercial := v_commercial || jsonb_build_object(v_key, v_envelope);
  END LOOP;
  IF p_row ? 'priceBasis' AND p_row -> 'priceBasis' IS DISTINCT FROM '"unknown"'::jsonb THEN
    RAISE EXCEPTION 'document extraction row % classified its price basis', p_ordinal
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_commercial = '{}'::jsonb THEN
    RETURN NULL;
  END IF;
  IF NOT p_row ? 'priceBasis' THEN
    RAISE EXCEPTION 'document extraction row % requires priceBasis', p_ordinal
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN v_commercial;
END;
$$;

-- One designer decision's commercial object, normalized. Every key is
-- required; each value is the designer's bare scalar or null (null discards
-- the reading). Raises on anything else.
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
      length(v_key) > 200 OR v_key ~ '^[=+@]' OR v_key ~ '^-[A-Za-z]' OR v_key ~ '[[:cntrl:]]'
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

ALTER FUNCTION public.stage_project_ffe_document_extraction(uuid, uuid, uuid, text, jsonb)
  RENAME TO _stage_project_ffe_document_extraction_00661_impl;

REVOKE ALL ON FUNCTION public._stage_project_ffe_document_extraction_00661_impl(uuid, uuid, uuid, text, jsonb)
  FROM PUBLIC, anon, authenticated, service_role;

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
      IF v_placed ->> 'outcome' IS DISTINCT FROM 'created' THEN
        RAISE EXCEPTION 'import row % confirmed commercial values would overwrite an existing selection', v_row.row_ordinal
          USING ERRCODE = 'check_violation';
      END IF;
      v_commercial := v_row.commercial_decision;
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

-- supersede_project_selection: 00439 body verbatim; the delta carries the
-- predecessor's currency whenever its prices are carried (no replacement
-- product). A replacement product is priced from products, which are USD.
CREATE OR REPLACE FUNCTION public.supersede_project_selection(p_request jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $$
DECLARE v_old_id uuid:=NULLIF(p_request->>'selectionId','')::uuid; v_old public.project_ffe_items%ROWTYPE;
  v_new public.project_ffe_items%ROWTYPE; v_new_product uuid:=NULLIF(p_request->>'productId','')::uuid;
  v_placements uuid[]; v_expected integer; v_updated integer;
BEGIN
  SELECT * INTO v_old FROM public.project_ffe_items WHERE id=v_old_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'selection not found' USING ERRCODE='no_data_found'; END IF;
  PERFORM public._ffe_require_studio_project(v_old.project_id);
  IF v_old.purchase_order_id IS NOT NULL OR v_old.status IN ('delivered','installed') THEN
    RAISE EXCEPTION 'ordered, delivered, or installed selections require the PO change command'
      USING ERRCODE='check_violation';
  END IF;
  IF EXISTS(SELECT 1 FROM public.furnishing_authorization_items line
    JOIN public.project_commercial_documents document ON document.id=line.commercial_document_id
    JOIN public.proposals proposal ON proposal.id=document.proposal_id
    WHERE line.source_ffe_item_id=v_old.id AND proposal.commercial_state IN ('draft','sent','executed')) THEN
    RAISE EXCEPTION 'authorized selections require void or commercial change authority'
      USING ERRCODE='check_violation';
  END IF;
  IF v_old.design_disposition='superseded' OR v_old.removed_at IS NOT NULL THEN
    RAISE EXCEPTION 'selection is already inactive' USING ERRCODE='check_violation';
  END IF;
  IF v_new_product IS NOT NULL AND NOT public._can_read_configurable_product(v_new_product) THEN
    RAISE EXCEPTION 'replacement product not found or not accessible' USING ERRCODE='insufficient_privilege';
  END IF;
  SELECT array_agg(DISTINCT value::uuid) INTO v_placements
  FROM jsonb_array_elements_text(COALESCE(p_request->'placementIds','[]'::jsonb));
  v_expected:=COALESCE(cardinality(v_placements),0);
  IF v_expected <> jsonb_array_length(COALESCE(p_request->'placementIds','[]'::jsonb)) OR (
    SELECT count(*) FROM public.proposal_board_items placement
    JOIN public.proposal_boards board ON board.id=placement.board_id
    WHERE placement.id=ANY(COALESCE(v_placements,'{}'::uuid[]))
      AND board.project_id=v_old.project_id AND placement.project_ffe_item_id=v_old.id
  ) <> v_expected THEN RAISE EXCEPTION 'chosen placements must be distinct links to the predecessor'
    USING ERRCODE='integrity_constraint_violation'; END IF;
  UPDATE public.project_ffe_items SET design_disposition='superseded',updated_at=now() WHERE id=v_old.id;
  INSERT INTO public.project_ffe_items(
    project_id,project_room_id,product_id,name,ffe_category,item_type,status,quantity,
    unit_price_cents,line_total_cents,budget_min_cents,budget_max_cents,vendor_name,vendor_id,
    blocked,notes,sort_order,trade_price_cents,markup_percent,added_via,doc_code,custom_fields,
    selection_thread_id,supersedes_ffe_item_id,design_disposition,assignment_scope,role_identity,
    currency
  ) SELECT project_id,project_room_id,COALESCE(v_new_product,product_id),
    COALESCE(NULLIF(btrim(p_request->>'name'),''),name),ffe_category,item_type,'specified',quantity,
    CASE WHEN v_new_product IS NULL THEN unit_price_cents ELSE COALESCE((SELECT price_retail FROM public.products WHERE id=v_new_product),0) END,
    quantity*CASE WHEN v_new_product IS NULL THEN COALESCE(unit_price_cents,0) ELSE COALESCE((SELECT price_retail FROM public.products WHERE id=v_new_product),0) END,
    budget_min_cents,budget_max_cents,
    CASE WHEN v_new_product IS NULL THEN vendor_name ELSE (SELECT vendor.name FROM public.products product LEFT JOIN public.vendors vendor ON vendor.id=product.vendor_id WHERE product.id=v_new_product) END,
    CASE WHEN v_new_product IS NULL THEN vendor_id ELSE (SELECT vendor_id FROM public.products WHERE id=v_new_product) END,
    false,NULL,sort_order,
    CASE WHEN v_new_product IS NULL THEN trade_price_cents ELSE COALESCE((SELECT price_trade FROM public.products WHERE id=v_new_product),(SELECT price_retail FROM public.products WHERE id=v_new_product),0) END,
    markup_percent,'replacement',doc_code,custom_fields,selection_thread_id,id,'selected',assignment_scope,role_identity,
    CASE WHEN v_new_product IS NULL THEN currency ELSE 'USD' END
  FROM public.project_ffe_items WHERE id=v_old.id RETURNING * INTO v_new;
  INSERT INTO public.project_ffe_specs(ffe_item_id,routing_source,updated_by)
  VALUES(v_new.id,jsonb_build_object('supersedesSelectionId',v_old.id),auth.uid()) ON CONFLICT DO NOTHING;
  IF v_expected>0 THEN
    UPDATE public.proposal_board_items SET project_ffe_item_id=v_new.id,product_id=v_new.product_id
    WHERE id=ANY(v_placements) AND project_ffe_item_id=v_old.id;
    GET DIAGNOSTICS v_updated=ROW_COUNT;
    IF v_updated<>v_expected THEN RAISE EXCEPTION 'not every chosen placement was repointed'
      USING ERRCODE='integrity_constraint_violation'; END IF;
  END IF;
  RETURN jsonb_build_object('predecessorSelectionId',v_old.id,'selectionId',v_new.id,
    'threadId',v_new.selection_thread_id,'repointedPlacementIds',to_jsonb(COALESCE(v_placements,'{}'::uuid[])));
END;
$$;

-- ── Totals never add across currencies ─────────────────────────────────────
-- Every money document built from project_ffe_items is USD-implicit: neither
-- purchase_orders, furnishing_authorization_items nor project_budget_lines
-- carries a currency. Rather than guard each RPC that sums into one, a non-USD
-- selection is refused where it would ENTER such a document.

-- (a) A purchase-order line. Covers every path that links a selection to a PO
--     (create_purchase_order, change/rebuild, replacement repricing) and so
--     every PO sum downstream: purchase_orders.total_cents, po_payments, the
--     00403 link-time total check, the delivery_events view, po-send's PDF
--     total and coherence gate.
CREATE OR REPLACE FUNCTION public._ffe_guard_usd_purchase_order_line()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public','pg_temp' AS $$
BEGIN
  RAISE EXCEPTION 'purchase orders are denominated in USD; selection % is priced in %', NEW.id, NEW.currency
    USING ERRCODE = 'check_violation';
END;
$$;

DROP TRIGGER IF EXISTS trg_ffe_usd_purchase_order_line ON public.project_ffe_items;
CREATE TRIGGER trg_ffe_usd_purchase_order_line
  BEFORE INSERT OR UPDATE OF purchase_order_id, currency ON public.project_ffe_items
  FOR EACH ROW WHEN (NEW.purchase_order_id IS NOT NULL AND NEW.currency <> 'USD')
  EXECUTE FUNCTION public._ffe_guard_usd_purchase_order_line();

-- (b) A furnishings-authorization or trade-scope line (the commercial document
--     the client signs and is invoiced against). Covers both creators (00423,
--     00578) and every total read back from the snapshot: document totals,
--     the working budget's authorized rollup, the client Threshold.
--     SECURITY DEFINER so RLS cannot hide the source row and fail open.
CREATE OR REPLACE FUNCTION public._ffe_guard_usd_authorization_line()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.project_ffe_items item
             WHERE item.id = NEW.source_ffe_item_id AND item.currency <> 'USD') THEN
    RAISE EXCEPTION 'commercial documents are denominated in USD; selection % is priced in another currency', NEW.source_ffe_item_id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ffe_usd_authorization_line ON public.furnishing_authorization_items;
CREATE TRIGGER trg_ffe_usd_authorization_line
  BEFORE INSERT OR UPDATE OF source_ffe_item_id ON public.furnishing_authorization_items
  FOR EACH ROW WHEN (NEW.source_ffe_item_id IS NOT NULL)
  EXECUTE FUNCTION public._ffe_guard_usd_authorization_line();

-- (c) The working budget. derive_working_budget_draft (00423) and
--     publish_budget_checkpoint (00578) sum fixed selections' line_total_cents
--     live into project_budget_lines, whose stamp the client acknowledges.
--     Both are renamed and wrapped (bodies untouched); the wrapper runs the
--     impl first, so its access check still decides who may ask, then refuses
--     — rolling the impl's writes back — if a non-USD amount was in the sum.
--     The predicate mirrors the sums' own filter (project, not a trade-scope
--     presence line, fixed, a nonzero line total); allowances contribute
--     budget_max_cents, a designer budget, not a priced amount.
CREATE OR REPLACE FUNCTION public._ffe_require_usd_budget_rollup(p_project_id uuid)
RETURNS void LANGUAGE plpgsql STABLE SET search_path TO 'public','pg_temp' AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.project_ffe_items item
             WHERE item.project_id = p_project_id AND item.trade_scope_document_id IS NULL
               AND item.item_type = 'fixed' AND COALESCE(item.line_total_cents, 0) <> 0
               AND item.currency <> 'USD') THEN
    RAISE EXCEPTION 'the working budget is denominated in USD; a selection priced in another currency cannot be added into it'
      USING ERRCODE = 'check_violation';
  END IF;
END;
$$;

ALTER FUNCTION public.derive_working_budget_draft(uuid)
  RENAME TO _derive_working_budget_draft_00661_impl;
REVOKE ALL ON FUNCTION public._derive_working_budget_draft_00661_impl(uuid)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.derive_working_budget_draft(p_project_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_result jsonb;
BEGIN
  v_result := public._derive_working_budget_draft_00661_impl(p_project_id);
  PERFORM public._ffe_require_usd_budget_rollup(p_project_id);
  RETURN v_result;
END;
$$;

ALTER FUNCTION public.publish_budget_checkpoint(uuid, uuid)
  RENAME TO _publish_budget_checkpoint_00661_impl;
REVOKE ALL ON FUNCTION public._publish_budget_checkpoint_00661_impl(uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.publish_budget_checkpoint(p_project_id uuid, p_version_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_result jsonb;
BEGIN
  v_result := public._publish_budget_checkpoint_00661_impl(p_project_id, p_version_id);
  PERFORM public._ffe_require_usd_budget_rollup(p_project_id);
  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.derive_working_budget_draft(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.derive_working_budget_draft(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.publish_budget_checkpoint(uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.publish_budget_checkpoint(uuid, uuid) TO authenticated;
REVOKE ALL ON FUNCTION public._ffe_guard_usd_purchase_order_line(),
  public._ffe_guard_usd_authorization_line(),
  public._ffe_require_usd_budget_rollup(uuid)
FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public._ffe_has_formula_like_text(jsonb),
  public._ffe_extracted_commercial(jsonb, integer),
  public._ffe_import_commercial_decision(jsonb, integer)
FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.stage_project_ffe_document_extraction(uuid, uuid, uuid, text, jsonb)
FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.stage_project_ffe_document_extraction(uuid, uuid, uuid, text, jsonb)
TO service_role;

REVOKE ALL ON FUNCTION public.commit_project_ffe_import(uuid, jsonb)
FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.commit_project_ffe_import(uuid, jsonb)
TO authenticated;
