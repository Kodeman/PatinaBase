-- 00824 — Edit a draft invoice atomically (US-38).
-- Validation, line writes and money math grafted from create_draft_invoice (00511).
-- Hours mirror compose_project_invoice (00821); invoice authority is 00817.
-- Release lineage: void legacy 00574 and purchase/rider FK release 00709.
-- void_invoice wrapper lineage: 00397 → 00817 → 00824 (entry-first serialization and billing prelock).
-- compose_project_invoice: latest 00821 (including entry-first fixes), prelock-only graft.
-- Existing-invoice order: authorized hours → invoice → canonical billing resources.
-- This matches issue_invoice; new-invoice roots prelock before creating their own row.
-- Shared billing-resource order. Missing ids are left to each writer's validation.
-- The helper is internal: payload ids do not confer authority to write a resource.
CREATE OR REPLACE FUNCTION public._invoice_billing_prelock(
  p_milestone_ids uuid[], p_purchase_ids uuid[], p_rider_ids uuid[], p_ffe_item_ids uuid[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_item_id uuid;
BEGIN
  PERFORM milestone.id FROM public.project_payment_milestones AS milestone
  WHERE milestone.id = ANY(p_milestone_ids) ORDER BY milestone.id FOR UPDATE;
  PERFORM purchase.id FROM public.studio_purchases AS purchase
  WHERE purchase.id = ANY(p_purchase_ids) ORDER BY purchase.id FOR UPDATE;
  PERFORM rider.id FROM public.po_cost_lines AS rider
  WHERE rider.id = ANY(p_rider_ids) ORDER BY rider.id FOR UPDATE;
  FOR v_item_id IN SELECT DISTINCT id FROM unnest(p_ffe_item_ids) AS item(id)
    WHERE id IS NOT NULL ORDER BY id
  LOOP
    PERFORM pg_advisory_xact_lock(hashtextextended('invoice_line_ffe_slot:' || v_item_id::text, 0));
  END LOOP;
END;
$$;
REVOKE ALL ON FUNCTION public._invoice_billing_prelock(uuid[],uuid[],uuid[],uuid[]) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.update_draft_invoice(
  p_invoice_id uuid,
  p_expected_updated_at timestamptz,
  p_tax_rate numeric,
  p_payment_terms_days integer,
  p_memo text,
  p_internal_notes text,
  p_lines jsonb,
  p_entry_ids uuid[],
  p_billing_lines jsonb
)
RETURNS public.invoices
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_invoice public.invoices%ROWTYPE;
  v_project public.projects%ROWTYPE;
  v_claimed integer;
  v_subtotal integer := 0;
  v_tax integer := 0;
BEGIN
  IF COALESCE(current_setting('role', true), 'none') <> 'authenticated'
     OR auth.uid() IS NULL OR NOT public.can_manage_invoice(p_invoice_id) THEN
    RAISE EXCEPTION 'update_draft_invoice: invoice not found or access denied'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  -- Serialize edits and voids before discovering their changing hour set:
  -- waiting on the invoice alone could miss hours claimed by a preceding edit.
  PERFORM pg_advisory_xact_lock(hashtextextended('invoice-edit:' || p_invoice_id::text, 0));
  SELECT * INTO STRICT v_invoice FROM public.invoices WHERE id = p_invoice_id;

  -- Lock the union of held and requested hours before the invoice. Requested
  -- foreign/unauthorized entries never acquire locks; eligibility is rechecked
  -- below. Void uses this same entry-first order.
  PERFORM entry.id
  FROM public.project_time_entries AS entry
  JOIN public.projects AS project ON project.id = entry.project_id
  WHERE entry.invoice_id = p_invoice_id
     OR (entry.id = ANY(p_entry_ids)
       AND project.id = v_invoice.project_id
       AND (entry.invoice_id IS NULL OR entry.invoice_id = p_invoice_id)
       AND (
      project.designer_id = auth.uid()
      OR (entry.user_id = auth.uid() AND (
        public.is_project_team_member(entry.project_id)
        OR public.is_studio_comember(project.designer_id)
      ))
      OR public.is_org_admin_or_owner(public.project_pricing_studio_id(entry.project_id))
    ))
  ORDER BY entry.id
  FOR UPDATE OF entry;

  -- Hours precede the invoice; the invoice precedes every billing resource,
  -- matching issue_invoice without inverting compose/commercial-hour edits.
  SELECT * INTO STRICT v_invoice FROM public.invoices WHERE id = p_invoice_id FOR UPDATE;
  PERFORM public._invoice_billing_prelock(
    ARRAY(SELECT milestone.id FROM public.project_payment_milestones AS milestone WHERE milestone.invoice_id = p_invoice_id UNION SELECT line.milestone_id FROM public.invoice_line_items AS line WHERE line.invoice_id = p_invoice_id UNION SELECT btrim(line->>'milestone_id')::uuid FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p_lines) = 'array' THEN p_lines ELSE '[]'::jsonb END) AS line WHERE pg_input_is_valid(btrim(line->>'milestone_id'), 'uuid')),
    ARRAY(SELECT source.id FROM public.studio_purchases AS source JOIN public.invoice_line_items AS line ON line.id = source.invoice_line_id WHERE line.invoice_id = p_invoice_id UNION SELECT btrim(line->>'purchaseId')::uuid FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p_billing_lines) = 'array' THEN p_billing_lines ELSE '[]'::jsonb END) AS line WHERE pg_input_is_valid(btrim(line->>'purchaseId'), 'uuid')),
    ARRAY(SELECT source.id FROM public.po_cost_lines AS source JOIN public.invoice_line_items AS line ON line.id = source.invoice_line_id WHERE line.invoice_id = p_invoice_id UNION SELECT btrim(line->>'costLineId')::uuid FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p_billing_lines) = 'array' THEN p_billing_lines ELSE '[]'::jsonb END) AS line WHERE pg_input_is_valid(btrim(line->>'costLineId'), 'uuid')),
    ARRAY(SELECT line.ffe_item_id FROM public.invoice_line_items AS line WHERE line.invoice_id = p_invoice_id UNION SELECT btrim(line->>'ffe_item_id')::uuid FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p_lines) = 'array' THEN p_lines ELSE '[]'::jsonb END) AS line WHERE pg_input_is_valid(btrim(line->>'ffe_item_id'), 'uuid') UNION SELECT btrim(line->>'ffeItemId')::uuid FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p_billing_lines) = 'array' THEN p_billing_lines ELSE '[]'::jsonb END) AS line WHERE pg_input_is_valid(btrim(line->>'ffeItemId'), 'uuid'))
  );

  IF NOT public.can_manage_invoice(p_invoice_id) THEN
    RAISE EXCEPTION 'update_draft_invoice: invoice not found or access denied'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_invoice.status <> 'draft' THEN
    RAISE EXCEPTION 'update_draft_invoice: not_draft' USING ERRCODE = 'check_violation';
  END IF;
  IF v_invoice.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'update_draft_invoice: stale' USING ERRCODE = 'check_violation';
  END IF;

  SELECT count(*) INTO v_claimed
  FROM public.project_time_entries AS entry
  JOIN public.projects AS project ON project.id = entry.project_id
  WHERE entry.id = ANY(p_entry_ids)
    AND project.id = v_invoice.project_id
    AND (entry.invoice_id IS NULL OR entry.invoice_id = p_invoice_id)
    AND entry.billable
    AND entry.duration_minutes IS NOT NULL
    AND (entry.billing_state = 'authorized' OR entry.billing_state IS NULL)
    AND entry.rate_source IS DISTINCT FROM 'none'
    AND (
      project.designer_id = auth.uid()
      OR (entry.user_id = auth.uid() AND (
        public.is_project_team_member(entry.project_id)
        OR public.is_studio_comember(project.designer_id)
      ))
      OR public.is_org_admin_or_owner(public.project_pricing_studio_id(entry.project_id))
    );
  IF v_claimed <> COALESCE(cardinality(p_entry_ids), 0) THEN
    RAISE EXCEPTION 'update_draft_invoice: claim_short' USING ERRCODE = 'check_violation';
  END IF;

  PERFORM line.id FROM public.invoice_line_items AS line
  WHERE line.invoice_id = p_invoice_id ORDER BY line.id FOR UPDATE;

  BEGIN
    UPDATE public.project_payment_milestones AS milestone
    SET invoice_id = NULL, status = 'pending', due_date = NULL, paid_at = NULL, updated_at = now()
    WHERE milestone.invoice_id = p_invoice_id
       OR EXISTS (SELECT 1 FROM public.invoice_line_items AS line
                  WHERE line.invoice_id = p_invoice_id AND line.milestone_id = milestone.id);
    UPDATE public.invoice_line_items
    SET metadata = metadata || jsonb_build_object('released_milestone_id', milestone_id::text),
        milestone_id = NULL, kind = 'adhoc'
    WHERE invoice_id = p_invoice_id AND milestone_id IS NOT NULL;
    UPDATE public.invoice_line_items
    SET metadata = metadata || jsonb_build_object('released_ffe_item_id', ffe_item_id::text),
        ffe_item_id = NULL, kind = 'adhoc'
    WHERE invoice_id = p_invoice_id AND ffe_item_id IS NOT NULL;
    -- FK SET NULL and release_studio_purchase_billing restore purchase/rider
    -- stamps just as the invoice-void trigger does (00709).
    DELETE FROM public.invoice_line_items WHERE invoice_id = p_invoice_id;

    IF v_invoice.project_id IS NULL THEN
      IF COALESCE(cardinality(p_entry_ids), 0) <> 0
         OR COALESCE(p_billing_lines, '[]'::jsonb) <> '[]'::jsonb
         OR jsonb_array_length(p_lines) = 0
         OR EXISTS (SELECT 1 FROM jsonb_to_recordset(p_lines) AS line(kind text)
                    WHERE line.kind IS DISTINCT FROM 'adhoc') THEN
        RAISE EXCEPTION 'a studio invoice carries ad-hoc lines only' USING ERRCODE = 'check_violation';
      END IF;
      IF NOT public.is_active_studio_member(v_invoice.studio_id)
         OR NOT EXISTS (SELECT 1 FROM public.organizations AS studio
                        WHERE studio.id = v_invoice.studio_id AND studio.type = 'design_studio' AND studio.status = 'active')
         OR NOT EXISTS (SELECT 1 FROM public.designer_clients AS relationship
                        JOIN public.organization_members AS membership ON membership.user_id = relationship.designer_id
                        WHERE relationship.client_id = v_invoice.client_id
                          AND relationship.designer_id = v_invoice.designer_id
                          AND membership.organization_id = v_invoice.studio_id
                          AND membership.status = 'active' AND membership.role <> 'guest')
         OR NOT public.has_designer_domain_role(v_invoice.designer_id) THEN
        RAISE EXCEPTION 'studio invoice studio not found or access denied' USING ERRCODE = 'insufficient_privilege';
      END IF;
    ELSE
      SELECT * INTO STRICT v_project FROM public.projects WHERE id = v_invoice.project_id;
    END IF;
    IF p_lines IS NULL
       OR jsonb_typeof(p_lines) <> 'array'
       OR jsonb_array_length(p_lines) > 200
       OR octet_length(p_lines::text) > 262144
       OR p_tax_rate IS NULL
       OR p_tax_rate < 0
       OR p_tax_rate > 1
       OR p_payment_terms_days IS NULL
       OR p_payment_terms_days < 0
       OR p_payment_terms_days > 365
       OR char_length(COALESCE(p_memo, '')) > 10000
       OR char_length(COALESCE(p_internal_notes, '')) > 10000
       OR EXISTS (
         SELECT 1
         FROM jsonb_array_elements(p_lines) AS element(value)
         WHERE jsonb_typeof(element.value) <> 'object'
            OR EXISTS (
              SELECT 1
              FROM jsonb_object_keys(element.value) AS key(name)
              WHERE key.name <> ALL(ARRAY[
                'kind', 'milestone_id', 'ffe_item_id', 'description',
                'quantity', 'unit_amount_cents', 'metadata', 'sort_order'
              ]::text[])
            )
            OR jsonb_typeof(COALESCE(element.value->'metadata', '{}'::jsonb))
                 <> 'object'
            OR COALESCE(element.value->'metadata', '{}'::jsonb) ?| ARRAY[
              'commercialDocumentId', 'tradeScopeDocumentId',
              'tradeScopeId', 'drawId'
            ]::text[]
       )
    THEN
      RAISE EXCEPTION 'invalid draft invoice payload'
        USING ERRCODE = 'check_violation';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM jsonb_to_recordset(p_lines) AS line(
        kind text,
        milestone_id uuid,
        ffe_item_id uuid,
        description text,
        quantity numeric,
        unit_amount_cents integer,
        metadata jsonb,
        sort_order integer
      )
      WHERE line.kind IS NULL
         OR line.kind NOT IN ('milestone', 'time', 'adhoc', 'ffe')
         OR NULLIF(btrim(line.description), '') IS NULL
         OR char_length(line.description) > 2000
         OR line.quantity IS NULL
         OR line.quantity <= 0
         OR line.quantity > 100000
         OR line.unit_amount_cents IS NULL
         OR line.unit_amount_cents < 0
         OR line.unit_amount_cents > 1000000000
         OR line.sort_order IS NULL
         OR line.sort_order < 0
         OR line.sort_order > 1000000
         OR (
           line.milestone_id IS NOT NULL
           AND NOT EXISTS (
             SELECT 1
             FROM public.project_payment_milestones AS milestone
             WHERE milestone.id = line.milestone_id
               AND milestone.project_id = v_project.id
               AND milestone.invoice_id IS NULL
               AND line.kind = 'milestone'
               AND line.quantity = 1
               AND line.unit_amount_cents = milestone.amount_cents
           )
         )
         OR (
           line.kind = 'milestone'
           AND (line.milestone_id IS NULL OR line.ffe_item_id IS NOT NULL)
         )
         OR (
           line.kind = 'ffe'
           AND (line.ffe_item_id IS NULL OR line.milestone_id IS NOT NULL)
         )
         OR (
           line.kind IN ('time', 'adhoc')
           AND (line.milestone_id IS NOT NULL OR line.ffe_item_id IS NOT NULL)
         )
         OR (
           line.ffe_item_id IS NOT NULL
           AND NOT EXISTS (
             SELECT 1
             FROM public.project_ffe_items AS item
             WHERE item.id = line.ffe_item_id
               AND item.project_id = v_project.id
           )
         )
    ) THEN
      RAISE EXCEPTION 'invalid draft invoice payload'
        USING ERRCODE = 'check_violation';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM jsonb_to_recordset(p_lines) AS line(milestone_id uuid)
      WHERE line.milestone_id IS NOT NULL
      GROUP BY line.milestone_id
      HAVING count(*) <> 1
    ) OR EXISTS (
      SELECT 1
      FROM jsonb_to_recordset(p_lines) AS line(ffe_item_id uuid)
      WHERE line.ffe_item_id IS NOT NULL
      GROUP BY line.ffe_item_id
      HAVING count(*) <> 1
    ) THEN
      RAISE EXCEPTION 'invalid draft invoice payload'
        USING ERRCODE = 'check_violation';
    END IF;


    SELECT COALESCE(sum(
      round(line.quantity * line.unit_amount_cents)::integer
    ), 0)::integer
    INTO v_subtotal
    FROM jsonb_to_recordset(p_lines) AS line(
      quantity numeric,
      unit_amount_cents integer
    );
    v_tax := round(v_subtotal * p_tax_rate)::integer;


    UPDATE public.invoices
    SET tax_rate = p_tax_rate, payment_terms_days = p_payment_terms_days,
        memo = NULLIF(p_memo, ''), internal_notes = NULLIF(p_internal_notes, ''),
        subtotal_cents = v_subtotal, tax_cents = v_tax, total_cents = v_subtotal + v_tax,
        updated_at = now()
    WHERE id = p_invoice_id;
    INSERT INTO public.invoice_line_items (
      invoice_id, kind, milestone_id, ffe_item_id, description, quantity,
      unit_amount_cents, amount_cents, metadata, sort_order
    )
    SELECT
      v_invoice.id, line.kind, line.milestone_id, line.ffe_item_id,
      btrim(line.description), line.quantity, line.unit_amount_cents,
      round(line.quantity * line.unit_amount_cents)::integer,
      COALESCE(line.metadata, '{}'::jsonb), line.sort_order
    FROM jsonb_to_recordset(p_lines) AS line(
      kind text,
      milestone_id uuid,
      ffe_item_id uuid,
      description text,
      quantity numeric,
      unit_amount_cents integer,
      metadata jsonb,
      sort_order integer
    )
    ORDER BY line.sort_order;


  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'update_draft_invoice: draft: %', SQLERRM USING ERRCODE = SQLSTATE;
  END;

  UPDATE public.project_time_entries SET invoice_id = NULL
  WHERE invoice_id = p_invoice_id AND NOT (id = ANY(COALESCE(p_entry_ids, '{}'::uuid[])));
  UPDATE public.project_time_entries AS entry SET invoice_id = p_invoice_id
  FROM public.projects AS project
  WHERE entry.id = ANY(p_entry_ids)
    AND project.id = entry.project_id AND project.id = v_invoice.project_id
    AND (entry.invoice_id IS NULL OR entry.invoice_id = p_invoice_id)
    AND entry.billable
    AND entry.duration_minutes IS NOT NULL
    AND (entry.billing_state = 'authorized' OR entry.billing_state IS NULL)
    AND entry.rate_source IS DISTINCT FROM 'none'
    AND (
      project.designer_id = auth.uid()
      OR (entry.user_id = auth.uid() AND (
        public.is_project_team_member(entry.project_id)
        OR public.is_studio_comember(project.designer_id)
      ))
      OR public.is_org_admin_or_owner(public.project_pricing_studio_id(entry.project_id))
    );
  GET DIAGNOSTICS v_claimed = ROW_COUNT;
  IF v_claimed <> COALESCE(cardinality(p_entry_ids), 0) THEN
    RAISE EXCEPTION 'update_draft_invoice: claim_short' USING ERRCODE = 'check_violation';
  END IF;

  IF p_billing_lines IS NOT NULL AND p_billing_lines <> '[]'::jsonb THEN
    BEGIN
      -- Restore deposits before balances, independently of display sort_order.
      PERFORM * FROM public.add_invoice_billing_lines(p_invoice_id, (
        SELECT jsonb_agg(line ORDER BY CASE WHEN line->>'stage' = 'balance' THEN 1 ELSE 0 END, ordinal)
        FROM jsonb_array_elements(p_billing_lines) WITH ORDINALITY AS payload(line, ordinal)
      ));
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'update_draft_invoice: lines: %', SQLERRM USING ERRCODE = SQLSTATE;
    END;
  END IF;
  SELECT * INTO STRICT v_invoice FROM public.invoices WHERE id = p_invoice_id;
  RETURN v_invoice;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.update_draft_invoice(uuid,timestamptz,numeric,integer,text,text,jsonb,uuid[],jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_draft_invoice(uuid,timestamptz,numeric,integer,text,text,jsonb,uuid[],jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.void_invoice(
  p_invoice_id uuid,
  p_reason text
)
RETURNS public.invoices
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_invoice public.invoices%ROWTYPE;
BEGIN
  IF NOT public.can_manage_invoice(p_invoice_id) THEN
    RAISE EXCEPTION 'void_invoice: invoice % not found or access denied', p_invoice_id;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('invoice-edit:' || p_invoice_id::text, 0));
  -- Match compose/edit and the commercial-hour classifier: entries precede
  -- the invoice, otherwise void and edit can wait on each other.
  PERFORM entry.id FROM public.project_time_entries AS entry
  WHERE entry.invoice_id = p_invoice_id ORDER BY entry.id FOR UPDATE;

  SELECT * INTO v_invoice
  FROM public.invoices
  WHERE id = p_invoice_id
  FOR UPDATE;

  PERFORM public._invoice_billing_prelock(
    ARRAY(SELECT milestone.id FROM public.project_payment_milestones AS milestone WHERE milestone.invoice_id = p_invoice_id UNION SELECT line.milestone_id FROM public.invoice_line_items AS line WHERE line.invoice_id = p_invoice_id),
    ARRAY(SELECT source.id FROM public.studio_purchases AS source JOIN public.invoice_line_items AS line ON line.id = source.invoice_line_id WHERE line.invoice_id = p_invoice_id),
    ARRAY(SELECT source.id FROM public.po_cost_lines AS source JOIN public.invoice_line_items AS line ON line.id = source.invoice_line_id WHERE line.invoice_id = p_invoice_id),
    ARRAY(SELECT line.ffe_item_id FROM public.invoice_line_items AS line WHERE line.invoice_id = p_invoice_id)
  );


  IF v_invoice.id IS NULL OR NOT public.can_manage_invoice(p_invoice_id) THEN
    RAISE EXCEPTION 'void_invoice: invoice % not found or access denied', p_invoice_id;
  END IF;

  RETURN public._void_invoice_authorized_legacy_00397(p_invoice_id, p_reason);
END;
$$;

-- add_invoice_billing_lines lineage: 00709 → 00718 → 00817 → 00822 → 00824.
-- Deltas from 00822: same-invoice serialization, then canonical billing prelock.
CREATE OR REPLACE FUNCTION public.add_invoice_billing_lines(p_invoice_id uuid, p_lines jsonb)
RETURNS SETOF public.invoice_line_items
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_uid       uuid := auth.uid();
  v_keys      constant text[] := ARRAY['purchaseId', 'costLineId', 'ffeItemId', 'stage', 'depositPct',
                                       'amountCents', 'description', 'sortOrder'];
  v_invoice   public.invoices%ROWTYPE;
  v_purchase  public.studio_purchases%ROWTYPE;
  v_rider     public.po_cost_lines%ROWTYPE;
  v_item      public.project_ffe_items%ROWTYPE;
  v_line      public.invoice_line_items%ROWTYPE;
  v_el        jsonb;
  v_ids       uuid[] := '{}';
  v_subject   uuid;
  v_override  bigint;
  v_cost      bigint;
  v_amount    bigint;
  v_price     bigint;
  v_deposited bigint;
  v_staged    bigint;
  v_pct       numeric;
  v_stage     text;
  v_desc      text;
  v_sort      integer;
  v_next_sort integer;
  v_po_project uuid;
  v_subtotal  bigint;
  v_tax       bigint;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'add_invoice_billing_lines: not authenticated' USING ERRCODE = 'insufficient_privilege';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('invoice-edit:' || p_invoice_id::text, 0));
  SELECT * INTO v_invoice FROM public.invoices WHERE id = p_invoice_id FOR UPDATE;
  IF NOT FOUND OR NOT public.can_manage_invoice(p_invoice_id) THEN
    RAISE EXCEPTION 'add_invoice_billing_lines: invoice % not found or access denied', p_invoice_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  PERFORM public._invoice_billing_prelock(
    ARRAY(SELECT NULL::uuid WHERE false),
    ARRAY(SELECT btrim(line->>'purchaseId')::uuid FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p_lines) = 'array' THEN p_lines ELSE '[]'::jsonb END) AS line WHERE pg_input_is_valid(btrim(line->>'purchaseId'), 'uuid')),
    ARRAY(SELECT btrim(line->>'costLineId')::uuid FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p_lines) = 'array' THEN p_lines ELSE '[]'::jsonb END) AS line WHERE pg_input_is_valid(btrim(line->>'costLineId'), 'uuid')),
    ARRAY(SELECT btrim(line->>'ffeItemId')::uuid FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p_lines) = 'array' THEN p_lines ELSE '[]'::jsonb END) AS line WHERE pg_input_is_valid(btrim(line->>'ffeItemId'), 'uuid'))
  );
  IF v_invoice.status <> 'draft' THEN
    RAISE EXCEPTION 'add_invoice_billing_lines: invoice % is %, not a draft', p_invoice_id, v_invoice.status
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_invoice.project_id IS NULL THEN
    RAISE EXCEPTION 'add_invoice_billing_lines: a studio invoice has no project to bill from'
      USING ERRCODE = 'check_violation';
  END IF;
  IF p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array'
     OR jsonb_array_length(p_lines) = 0 OR jsonb_array_length(p_lines) > 200 THEN
    RAISE EXCEPTION 'add_invoice_billing_lines: lines must be an array of 1 to 200 objects'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT COALESCE(max(sort_order), -1) INTO v_next_sort
    FROM public.invoice_line_items WHERE invoice_id = p_invoice_id;

  FOR v_el IN SELECT value FROM jsonb_array_elements(p_lines) LOOP
    IF jsonb_typeof(v_el) <> 'object' OR (v_el - v_keys) <> '{}'::jsonb THEN
      RAISE EXCEPTION 'add_invoice_billing_lines: each line is an object with keys %', array_to_string(v_keys, ', ')
        USING ERRCODE = 'check_violation';
    END IF;
    IF (CASE WHEN v_el ? 'purchaseId' THEN 1 ELSE 0 END)
       + (CASE WHEN v_el ? 'costLineId' THEN 1 ELSE 0 END)
       + (CASE WHEN v_el ? 'ffeItemId' THEN 1 ELSE 0 END) <> 1 THEN
      RAISE EXCEPTION 'add_invoice_billing_lines: each line names exactly one of purchaseId, costLineId, ffeItemId'
        USING ERRCODE = 'check_violation';
    END IF;

    -- amountCents: the R-PB7 override, a whole number of cents.
    v_override := NULL;
    IF v_el ? 'amountCents' AND jsonb_typeof(v_el->'amountCents') <> 'null' THEN
      IF jsonb_typeof(v_el->'amountCents') <> 'number' THEN
        RAISE EXCEPTION 'add_invoice_billing_lines: amountCents must be whole cents from 0 to 1000000000'
          USING ERRCODE = 'check_violation';
      END IF;
      IF (v_el->>'amountCents')::numeric <> trunc((v_el->>'amountCents')::numeric)
         OR (v_el->>'amountCents')::numeric < 0
         OR (v_el->>'amountCents')::numeric > 1000000000 THEN
        RAISE EXCEPTION 'add_invoice_billing_lines: amountCents must be whole cents from 0 to 1000000000'
          USING ERRCODE = 'check_violation';
      END IF;
      v_override := (v_el->>'amountCents')::numeric::bigint;
    END IF;

    IF jsonb_typeof(COALESCE(v_el->'description', 'null'::jsonb)) NOT IN ('string', 'null') THEN
      RAISE EXCEPTION 'add_invoice_billing_lines: description must be a string'
        USING ERRCODE = 'check_violation';
    END IF;
    v_desc := NULLIF(btrim(COALESCE(v_el->>'description', '')), '');
    IF char_length(v_desc) > 2000 THEN
      RAISE EXCEPTION 'add_invoice_billing_lines: description is at most 2000 characters'
        USING ERRCODE = 'check_violation';
    END IF;

    IF v_el ? 'sortOrder' AND jsonb_typeof(v_el->'sortOrder') <> 'null' THEN
      IF jsonb_typeof(v_el->'sortOrder') <> 'number' THEN
        RAISE EXCEPTION 'add_invoice_billing_lines: sortOrder must be a whole number from 0 to 1000000'
          USING ERRCODE = 'check_violation';
      END IF;
      IF (v_el->>'sortOrder')::numeric <> trunc((v_el->>'sortOrder')::numeric)
         OR (v_el->>'sortOrder')::numeric < 0
         OR (v_el->>'sortOrder')::numeric > 1000000 THEN
        RAISE EXCEPTION 'add_invoice_billing_lines: sortOrder must be a whole number from 0 to 1000000'
          USING ERRCODE = 'check_violation';
      END IF;
      v_sort := (v_el->>'sortOrder')::numeric::integer;
    ELSE
      v_next_sort := v_next_sort + 1;
      v_sort := v_next_sort;
    END IF;

    BEGIN
      v_subject := NULLIF(btrim(COALESCE(v_el->>'purchaseId', v_el->>'costLineId', v_el->>'ffeItemId', '')), '')::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
      RAISE EXCEPTION 'add_invoice_billing_lines: purchaseId, costLineId and ffeItemId must be ids'
        USING ERRCODE = 'check_violation';
    END;
    IF v_subject IS NULL THEN
      RAISE EXCEPTION 'add_invoice_billing_lines: purchaseId, costLineId and ffeItemId must be ids'
        USING ERRCODE = 'check_violation';
    END IF;

    IF v_el ? 'purchaseId' THEN
      -- ── A studio purchase, at cost on its own line ──
      IF v_el ? 'stage' OR v_el ? 'depositPct' THEN
        RAISE EXCEPTION 'add_invoice_billing_lines: stage and depositPct belong to an ffeItemId line'
          USING ERRCODE = 'check_violation';
      END IF;
      SELECT * INTO v_purchase FROM public.studio_purchases WHERE id = v_subject FOR UPDATE;
      IF NOT FOUND OR v_purchase.project_id IS NULL OR NOT public.can_buy_for_project(v_purchase.project_id) THEN
        RAISE EXCEPTION 'add_invoice_billing_lines: purchase % not found or access denied', v_subject
          USING ERRCODE = 'insufficient_privilege';
      END IF;
      IF v_purchase.project_id <> v_invoice.project_id THEN
        RAISE EXCEPTION 'add_invoice_billing_lines: purchase % is on another project', v_subject
          USING ERRCODE = 'check_violation';
      END IF;
      IF v_purchase.status = 'void' THEN
        RAISE EXCEPTION 'add_invoice_billing_lines: purchase % was voided', v_subject
          USING ERRCODE = 'check_violation';
      END IF;
      IF v_purchase.invoice_line_id IS NOT NULL OR v_purchase.status = 'billed' THEN
        RAISE EXCEPTION 'add_invoice_billing_lines: purchase % is already billed', v_subject
          USING ERRCODE = 'check_violation';
      END IF;
      IF v_purchase.status <> 'recorded' THEN
        RAISE EXCEPTION 'add_invoice_billing_lines: purchase % was %', v_subject, v_purchase.status
          USING ERRCODE = 'check_violation';
      END IF;
      IF NOT v_purchase.billable_to_client THEN
        RAISE EXCEPTION 'add_invoice_billing_lines: purchase % is not billable to the client', v_subject
          USING ERRCODE = 'check_violation';
      END IF;
      IF v_purchase.currency_code <> v_invoice.currency THEN
        RAISE EXCEPTION 'add_invoice_billing_lines: purchase % is in %, the invoice in %',
          v_subject, v_purchase.currency_code, v_invoice.currency
          USING ERRCODE = 'check_violation';
      END IF;

      v_cost := v_purchase.amount_cents::bigint + v_purchase.tax_cents
              + v_purchase.buyer_premium_cents + v_purchase.shipping_cents;
      v_amount := COALESCE(v_override, v_cost);
      IF v_amount > 1000000000 THEN
        RAISE EXCEPTION 'add_invoice_billing_lines: purchase % is over the line limit', v_subject
          USING ERRCODE = 'check_violation';
      END IF;

      INSERT INTO public.invoice_line_items (
        invoice_id, kind, description, quantity, unit_amount_cents, amount_cents, metadata, sort_order
      ) VALUES (
        p_invoice_id, 'adhoc',
        COALESCE(v_desc, left(COALESCE(NULLIF(btrim(v_purchase.description), ''), v_purchase.payee_name), 2000)),
        1, v_amount, v_amount,
        jsonb_build_object('studioPurchaseId', v_purchase.id, 'billingRule', v_purchase.billing_rule),
        v_sort
      )
      RETURNING * INTO v_line;

      INSERT INTO public.invoice_line_item_internals (line_item_id, internal_metadata)
      VALUES (v_line.id, jsonb_build_object('costCents', v_cost));

      UPDATE public.studio_purchases
         SET invoice_line_id = v_line.id, status = 'billed'
       WHERE id = v_purchase.id;

    ELSIF v_el ? 'costLineId' THEN
      -- ── A PO rider, at cost on its own line ──
      IF v_el ? 'stage' OR v_el ? 'depositPct' THEN
        RAISE EXCEPTION 'add_invoice_billing_lines: stage and depositPct belong to an ffeItemId line'
          USING ERRCODE = 'check_violation';
      END IF;
      SELECT * INTO v_rider FROM public.po_cost_lines WHERE id = v_subject FOR UPDATE;
      IF NOT FOUND OR NOT public.can_send_purchase_order(v_rider.purchase_order_id) THEN
        RAISE EXCEPTION 'add_invoice_billing_lines: rider % not found or access denied', v_subject
          USING ERRCODE = 'insufficient_privilege';
      END IF;
      SELECT project_id INTO v_po_project FROM public.purchase_orders WHERE id = v_rider.purchase_order_id;
      IF v_po_project IS DISTINCT FROM v_invoice.project_id THEN
        RAISE EXCEPTION 'add_invoice_billing_lines: rider % is on another project', v_subject
          USING ERRCODE = 'check_violation';
      END IF;
      IF v_rider.invoice_line_id IS NOT NULL THEN
        RAISE EXCEPTION 'add_invoice_billing_lines: rider % is already billed', v_subject
          USING ERRCODE = 'check_violation';
      END IF;
      IF NOT v_rider.billable_to_client THEN
        RAISE EXCEPTION 'add_invoice_billing_lines: rider % is not billable to the client', v_subject
          USING ERRCODE = 'check_violation';
      END IF;

      v_cost := COALESCE(v_rider.actual_cents, v_rider.estimate_cents);
      IF v_cost IS NULL AND v_override IS NULL THEN
        RAISE EXCEPTION 'add_invoice_billing_lines: rider % has no estimate or actual; enter amountCents', v_subject
          USING ERRCODE = 'check_violation';
      END IF;
      v_amount := COALESCE(v_override, v_cost);
      IF v_amount < 0 OR v_amount > 1000000000 THEN
        RAISE EXCEPTION 'add_invoice_billing_lines: rider % amount is outside 0 to 1000000000', v_subject
          USING ERRCODE = 'check_violation';
      END IF;

      INSERT INTO public.invoice_line_items (
        invoice_id, kind, description, quantity, unit_amount_cents, amount_cents, metadata, sort_order
      ) VALUES (
        p_invoice_id, 'adhoc',
        COALESCE(v_desc, left(initcap(replace(v_rider.kind, '_', ' '))
                              || COALESCE(' · ' || NULLIF(btrim(v_rider.note), ''), ''), 2000)),
        1, v_amount, v_amount,
        jsonb_build_object('poCostLineId', v_rider.id, 'purchaseOrderId', v_rider.purchase_order_id,
                           'riderKind', v_rider.kind, 'billingRule', v_rider.billing_rule),
        v_sort
      )
      RETURNING * INTO v_line;

      INSERT INTO public.invoice_line_item_internals (line_item_id, internal_metadata)
      VALUES (v_line.id, jsonb_build_object('costCents', v_cost));

      UPDATE public.po_cost_lines SET invoice_line_id = v_line.id WHERE id = v_rider.id;

    ELSE
      -- ── A deposit or balance slot on an FF&E line ──
      v_stage := v_el->>'stage';
      IF v_stage IS NULL OR v_stage NOT IN ('deposit', 'balance') THEN
        RAISE EXCEPTION 'add_invoice_billing_lines: stage must be deposit or balance (a full bill goes through create_draft_invoice)'
          USING ERRCODE = 'check_violation';
      END IF;
      SELECT * INTO v_item FROM public.project_ffe_items WHERE id = v_subject FOR SHARE;
      IF NOT FOUND OR v_item.project_id <> v_invoice.project_id THEN
        RAISE EXCEPTION 'add_invoice_billing_lines: line % is not on this invoice''s project', v_subject
          USING ERRCODE = 'check_violation';
      END IF;
      IF v_item.removed_at IS NOT NULL THEN
        RAISE EXCEPTION 'add_invoice_billing_lines: line % was removed', v_subject
          USING ERRCODE = 'check_violation';
      END IF;
      v_price := v_item.quantity::bigint * v_item.unit_price_cents;

      v_pct := NULL;
      IF v_stage = 'deposit' THEN
        IF jsonb_typeof(COALESCE(v_el->'depositPct', 'null'::jsonb)) <> 'number' THEN
          RAISE EXCEPTION 'add_invoice_billing_lines: a deposit needs depositPct above 0 and at most 100'
            USING ERRCODE = 'check_violation';
        END IF;
        v_pct := (v_el->>'depositPct')::numeric;
        IF v_pct <= 0 OR v_pct > 100 OR v_pct <> round(v_pct, 2) THEN
          RAISE EXCEPTION 'add_invoice_billing_lines: a deposit needs depositPct above 0 and at most 100, to two places'
            USING ERRCODE = 'check_violation';
        END IF;
        IF v_price IS NULL AND v_override IS NULL THEN
          RAISE EXCEPTION 'add_invoice_billing_lines: line % has no client price; enter amountCents', v_subject
            USING ERRCODE = 'check_violation';
        END IF;
        v_amount := COALESCE(v_override, round(v_price * v_pct / 100)::bigint);
        -- 00718 (M4): deposit and balance sum to the price at most. A deposit
        -- re-added after its balance was computed fits in what is left.
        IF v_price IS NOT NULL THEN
          SELECT COALESCE(sum(li.amount_cents), 0) INTO v_staged
            FROM public.invoice_line_items AS li
            JOIN public.invoices AS i ON i.id = li.invoice_id AND i.status <> 'void'
           WHERE li.ffe_item_id = v_item.id AND li.billing_stage IN ('deposit', 'balance');
          IF v_amount > v_price - v_staged THEN
            RAISE EXCEPTION 'add_invoice_billing_lines: a deposit of % cents is more than the % cents left to bill on line %',
              v_amount, GREATEST(v_price - v_staged, 0), v_subject
              USING ERRCODE = 'check_violation';
          END IF;
        END IF;
        v_desc := COALESCE(v_desc, left('Deposit (' || rtrim(to_char(v_pct, 'FM990.99'), '.') || '%) · ' || v_item.name, 2000));
      ELSE
        IF v_el ? 'depositPct' THEN
          RAISE EXCEPTION 'add_invoice_billing_lines: depositPct belongs to a deposit'
            USING ERRCODE = 'check_violation';
        END IF;
        SELECT sum(li.amount_cents) INTO v_deposited
          FROM public.invoice_line_items AS li
          JOIN public.invoices AS i ON i.id = li.invoice_id AND i.status <> 'void'
         WHERE li.ffe_item_id = v_item.id AND li.billing_stage = 'deposit';
        IF v_deposited IS NULL THEN
          RAISE EXCEPTION 'add_invoice_billing_lines: line % has no deposit billed; bill it in full instead', v_subject
            USING ERRCODE = 'check_violation';
        END IF;
        IF v_price IS NULL AND v_override IS NULL THEN
          RAISE EXCEPTION 'add_invoice_billing_lines: line % has no client price; enter amountCents', v_subject
            USING ERRCODE = 'check_violation';
        END IF;
        v_amount := COALESCE(v_override, v_price - v_deposited);
        IF v_amount <= 0 AND v_override IS NULL THEN
          RAISE EXCEPTION 'add_invoice_billing_lines: line % has nothing left to bill after its deposit', v_subject
            USING ERRCODE = 'check_violation';
        END IF;
        -- 00718 (M4): a balance is at most the price less the live deposits.
        IF v_price IS NOT NULL AND v_amount > v_price - v_deposited THEN
          RAISE EXCEPTION 'add_invoice_billing_lines: a balance of % cents is more than the % cents left on line % after its deposit',
            v_amount, GREATEST(v_price - v_deposited, 0), v_subject
            USING ERRCODE = 'check_violation';
        END IF;
        v_desc := COALESCE(v_desc, left('Balance · ' || v_item.name, 2000));
      END IF;
      IF v_amount > 1000000000 THEN
        RAISE EXCEPTION 'add_invoice_billing_lines: line % is over the line limit', v_subject
          USING ERRCODE = 'check_violation';
      END IF;

      INSERT INTO public.invoice_line_items (
        invoice_id, kind, ffe_item_id, billing_stage, billing_stage_pct, description,
        quantity, unit_amount_cents, amount_cents, metadata, sort_order
      ) VALUES (
        p_invoice_id, 'ffe', v_item.id, v_stage, v_pct, v_desc,
        1, v_amount, v_amount, jsonb_build_object('billingStage', v_stage), v_sort
      )
      RETURNING * INTO v_line;
    END IF;

    v_ids := v_ids || v_line.id;
  END LOOP;

  -- Totals, the way create_draft_invoice computes them; tax stays the rate the
  -- studio entered.
  SELECT COALESCE(sum(amount_cents), 0) INTO v_subtotal
    FROM public.invoice_line_items WHERE invoice_id = p_invoice_id;
  v_tax := round(v_subtotal * v_invoice.tax_rate)::bigint;
  UPDATE public.invoices
     SET subtotal_cents = v_subtotal, tax_cents = v_tax, total_cents = v_subtotal + v_tax
   WHERE id = p_invoice_id;

  RETURN QUERY
    SELECT * FROM public.invoice_line_items WHERE id = ANY (v_ids) ORDER BY sort_order, created_at, id;
END;
$$;

-- Latest 00821 graft: only the canonical prelock call is added.
-- 00821 — Compose a project invoice in one transaction (US-36 K13).
-- Calls the 00511 draft writer and the 00817 studio-scoped billing writer. The
-- 00617 claim is INVOKER/RLS, so this DEFINER mirrors the project-hour
-- UPDATE and SELECT policy union (00177/00316/00484/00605/00606).
CREATE OR REPLACE FUNCTION public.compose_project_invoice(
  p_project_id uuid,
  p_expected_designer_id uuid,
  p_expected_client_id uuid,
  p_expected_studio_id uuid,
  p_tax_rate numeric,
  p_payment_terms_days integer,
  p_memo text,
  p_internal_notes text,
  p_lines jsonb,
  p_entry_ids uuid[],
  p_billing_lines jsonb
)
RETURNS public.invoices
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_invoice public.invoices%ROWTYPE;
  v_claimed integer;
  v_locked integer;
BEGIN
  -- Commercial-hour edits lock the entry before their classifier locks its
  -- project. Scope and authorize the ordered lock before taking any row lock;
  -- the precheck below rechecks eligibility on the locked rows.
  PERFORM entry.id
  FROM public.project_time_entries AS entry
  JOIN public.projects AS project ON project.id = entry.project_id
  WHERE entry.id = ANY(p_entry_ids)
    AND project.id = p_project_id
    AND entry.invoice_id IS NULL
    AND (
      project.designer_id = auth.uid()
      OR (entry.user_id = auth.uid() AND (
        public.is_project_team_member(entry.project_id)
        OR public.is_studio_comember(project.designer_id)
      ))
      OR public.is_org_admin_or_owner(public.project_pricing_studio_id(entry.project_id))
    )
  ORDER BY entry.id
  FOR UPDATE OF entry;
  GET DIAGNOSTICS v_locked = ROW_COUNT;
  IF v_locked <> COALESCE(cardinality(p_entry_ids), 0) THEN
    RAISE EXCEPTION 'compose_project_invoice: claim_short' USING ERRCODE = 'check_violation';
  END IF;

  SELECT count(*) INTO v_claimed
  FROM public.project_time_entries AS entry
  JOIN public.projects AS project ON project.id = entry.project_id
  WHERE entry.id = ANY(p_entry_ids)
    AND project.id = p_project_id
    AND entry.invoice_id IS NULL
    AND entry.billable
    AND entry.duration_minutes IS NOT NULL
    AND (entry.billing_state = 'authorized' OR entry.billing_state IS NULL)
    AND entry.rate_source IS DISTINCT FROM 'none'
    AND (
      -- Permissive UPDATE union from pg_policies: project lead (00177 ALL),
      -- own project-team hour, own studio-comember hour, studio owner/admin.
      project.designer_id = auth.uid()
      OR (entry.user_id = auth.uid() AND (
        public.is_project_team_member(entry.project_id)
        OR public.is_studio_comember(project.designer_id)
      ))
      OR public.is_org_admin_or_owner(public.project_pricing_studio_id(entry.project_id))
    );
  IF v_claimed <> COALESCE(cardinality(p_entry_ids), 0) THEN
    RAISE EXCEPTION 'compose_project_invoice: claim_short' USING ERRCODE = 'check_violation';
  END IF;

  PERFORM public._invoice_billing_prelock(
    ARRAY(SELECT btrim(line->>'milestone_id')::uuid FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p_lines) = 'array' THEN p_lines ELSE '[]'::jsonb END) AS line WHERE pg_input_is_valid(btrim(line->>'milestone_id'), 'uuid')),
    ARRAY(SELECT btrim(line->>'purchaseId')::uuid FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p_billing_lines) = 'array' THEN p_billing_lines ELSE '[]'::jsonb END) AS line WHERE pg_input_is_valid(btrim(line->>'purchaseId'), 'uuid')),
    ARRAY(SELECT btrim(line->>'costLineId')::uuid FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p_billing_lines) = 'array' THEN p_billing_lines ELSE '[]'::jsonb END) AS line WHERE pg_input_is_valid(btrim(line->>'costLineId'), 'uuid')),
    ARRAY(SELECT btrim(line->>'ffe_item_id')::uuid FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p_lines) = 'array' THEN p_lines ELSE '[]'::jsonb END) AS line WHERE pg_input_is_valid(btrim(line->>'ffe_item_id'), 'uuid') UNION SELECT btrim(line->>'ffeItemId')::uuid FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p_billing_lines) = 'array' THEN p_billing_lines ELSE '[]'::jsonb END) AS line WHERE pg_input_is_valid(btrim(line->>'ffeItemId'), 'uuid'))
  );

  BEGIN
    v_invoice := public.create_draft_invoice(
      p_project_id, p_expected_designer_id, p_expected_client_id,
      p_expected_studio_id, p_tax_rate, p_payment_terms_days,
      p_memo, p_internal_notes, p_lines
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'compose_project_invoice: draft: %', SQLERRM USING ERRCODE = SQLSTATE;
  END;

  BEGIN
    UPDATE public.project_time_entries AS entry
       SET invoice_id = v_invoice.id
      FROM public.projects AS project
     WHERE entry.id = ANY(p_entry_ids)
       AND entry.project_id = project.id
       AND project.id = p_project_id
       AND entry.invoice_id IS NULL
       AND entry.billable
       AND entry.duration_minutes IS NOT NULL
       AND (entry.billing_state = 'authorized' OR entry.billing_state IS NULL)
       AND entry.rate_source IS DISTINCT FROM 'none'
       AND (
         project.designer_id = auth.uid()
         OR (entry.user_id = auth.uid() AND (
           public.is_project_team_member(entry.project_id)
           OR public.is_studio_comember(project.designer_id)
         ))
         OR public.is_org_admin_or_owner(public.project_pricing_studio_id(entry.project_id))
       );
    GET DIAGNOSTICS v_claimed = ROW_COUNT;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'compose_project_invoice: claim: %', SQLERRM USING ERRCODE = SQLSTATE;
  END;
  IF v_claimed <> COALESCE(cardinality(p_entry_ids), 0) THEN
    RAISE EXCEPTION 'compose_project_invoice: claim_short' USING ERRCODE = 'check_violation';
  END IF;

  IF p_billing_lines IS NOT NULL AND p_billing_lines <> '[]'::jsonb THEN
    BEGIN
      PERFORM * FROM public.add_invoice_billing_lines(v_invoice.id, p_billing_lines);
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'compose_project_invoice: lines: %', SQLERRM USING ERRCODE = SQLSTATE;
    END;
  END IF;

  SELECT * INTO STRICT v_invoice FROM public.invoices WHERE id = v_invoice.id;
  RETURN v_invoice;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.compose_project_invoice(
  uuid, uuid, uuid, uuid, numeric, integer, text, text, jsonb, uuid[], jsonb
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.compose_project_invoice(
  uuid, uuid, uuid, uuid, numeric, integer, text, text, jsonb, uuid[], jsonb
) TO authenticated;

-- create_draft_invoice lineage: 00443 → 00511 → 00824.
-- Public authenticated root: same canonical resources before its latch/slot writes.
CREATE OR REPLACE FUNCTION public.create_draft_invoice(
  p_project_id uuid,
  p_expected_designer_id uuid,
  p_expected_client_id uuid,
  p_expected_studio_id uuid,
  p_tax_rate numeric DEFAULT 0,
  p_payment_terms_days integer DEFAULT 15,
  p_memo text DEFAULT NULL,
  p_internal_notes text DEFAULT NULL,
  p_lines jsonb DEFAULT '[]'::jsonb
)
RETURNS public.invoices
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_active_role text := COALESCE(current_setting('role', true), 'none');
  v_actor uuid := auth.uid();
  v_project public.projects%ROWTYPE;
  v_invoice public.invoices%ROWTYPE;
  v_subtotal integer := 0;
  v_tax integer := 0;
  v_expected_refs integer := 0;
  v_locked_refs integer := 0;
BEGIN
  IF v_active_role <> 'authenticated' OR v_actor IS NULL THEN
    RAISE EXCEPTION 'invoice project not found or access denied'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Discover only an exact-studio row the actor can already reach. Authority
  -- rows are locked below in the repository-wide revocation order.
  SELECT project.* INTO v_project
  FROM public.projects AS project
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
  WHERE project.id = p_project_id
    AND project.designer_id = p_expected_designer_id
    AND project.client_id = p_expected_client_id
    AND project.studio_id = p_expected_studio_id
    AND project.status = 'active'
    AND studio.type = 'design_studio'
    AND studio.status = 'active'
    AND actor_membership.status = 'active'
    AND actor_membership.role <> 'guest'
    AND lead_membership.status = 'active'
    AND lead_membership.role <> 'guest'
    AND role.domain = 'designer'
  ORDER BY role.id, user_role.id
  LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'invoice project not found or access denied'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT project.* INTO v_project
  FROM public.projects AS project
  WHERE project.id = p_project_id
    AND project.designer_id = p_expected_designer_id
    AND project.client_id = p_expected_client_id
    AND project.studio_id = p_expected_studio_id
    AND project.status = 'active'
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'invoice project not found or access denied'
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
  WHERE user_role.user_id = p_expected_designer_id
    AND role.domain = 'designer'
  ORDER BY user_role.role_id, user_role.id
  FOR SHARE OF user_role;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'invoice project not found or access denied'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  PERFORM membership.id
  FROM public.organization_members AS membership
  WHERE membership.organization_id = p_expected_studio_id
    AND membership.user_id = ANY(ARRAY[
      p_expected_designer_id, v_actor
    ]::uuid[])
  ORDER BY membership.user_id, membership.id
  FOR SHARE;

  PERFORM studio.id
  FROM public.organizations AS studio
  WHERE studio.id = p_expected_studio_id
  ORDER BY studio.id
  FOR SHARE;

  IF NOT EXISTS (
       SELECT 1
       FROM public.organizations AS studio
       WHERE studio.id = p_expected_studio_id
         AND studio.type = 'design_studio'
         AND studio.status = 'active'
     )
     OR NOT EXISTS (
       SELECT 1
       FROM public.organization_members AS membership
       WHERE membership.organization_id = p_expected_studio_id
         AND membership.user_id = v_actor
         AND membership.status = 'active'
         AND membership.role <> 'guest'
     )
     OR NOT EXISTS (
       SELECT 1
       FROM public.organization_members AS membership
       WHERE membership.organization_id = p_expected_studio_id
         AND membership.user_id = p_expected_designer_id
         AND membership.status = 'active'
         AND membership.role <> 'guest'
     )
  THEN
    RAISE EXCEPTION 'invoice project not found or access denied'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_lines IS NULL
     OR jsonb_typeof(p_lines) <> 'array'
     OR jsonb_array_length(p_lines) > 200
     OR octet_length(p_lines::text) > 262144
     OR p_tax_rate IS NULL
     OR p_tax_rate < 0
     OR p_tax_rate > 1
     OR p_payment_terms_days IS NULL
     OR p_payment_terms_days < 0
     OR p_payment_terms_days > 365
     OR char_length(COALESCE(p_memo, '')) > 10000
     OR char_length(COALESCE(p_internal_notes, '')) > 10000
     OR EXISTS (
       SELECT 1
       FROM jsonb_array_elements(p_lines) AS element(value)
       WHERE jsonb_typeof(element.value) <> 'object'
          OR EXISTS (
            SELECT 1
            FROM jsonb_object_keys(element.value) AS key(name)
            WHERE key.name <> ALL(ARRAY[
              'kind', 'milestone_id', 'ffe_item_id', 'description',
              'quantity', 'unit_amount_cents', 'metadata', 'sort_order'
            ]::text[])
          )
          OR jsonb_typeof(COALESCE(element.value->'metadata', '{}'::jsonb))
               <> 'object'
          OR COALESCE(element.value->'metadata', '{}'::jsonb) ?| ARRAY[
            'commercialDocumentId', 'tradeScopeDocumentId',
            'tradeScopeId', 'drawId'
          ]::text[]
     )
  THEN
    RAISE EXCEPTION 'invalid draft invoice payload'
      USING ERRCODE = 'check_violation';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(p_lines) AS line(
      kind text,
      milestone_id uuid,
      ffe_item_id uuid,
      description text,
      quantity numeric,
      unit_amount_cents integer,
      metadata jsonb,
      sort_order integer
    )
    WHERE line.kind IS NULL
       OR line.kind NOT IN ('milestone', 'time', 'adhoc', 'ffe')
       OR NULLIF(btrim(line.description), '') IS NULL
       OR char_length(line.description) > 2000
       OR line.quantity IS NULL
       OR line.quantity <= 0
       OR line.quantity > 100000
       OR line.unit_amount_cents IS NULL
       OR line.unit_amount_cents < 0
       OR line.unit_amount_cents > 1000000000
       OR line.sort_order IS NULL
       OR line.sort_order < 0
       OR line.sort_order > 1000000
       OR (
         line.milestone_id IS NOT NULL
         AND NOT EXISTS (
           SELECT 1
           FROM public.project_payment_milestones AS milestone
           WHERE milestone.id = line.milestone_id
             AND milestone.project_id = v_project.id
             AND milestone.invoice_id IS NULL
             AND line.kind = 'milestone'
             AND line.quantity = 1
             AND line.unit_amount_cents = milestone.amount_cents
         )
       )
       OR (
         line.kind = 'milestone'
         AND (line.milestone_id IS NULL OR line.ffe_item_id IS NOT NULL)
       )
       OR (
         line.kind = 'ffe'
         AND (line.ffe_item_id IS NULL OR line.milestone_id IS NOT NULL)
       )
       OR (
         line.kind IN ('time', 'adhoc')
         AND (line.milestone_id IS NOT NULL OR line.ffe_item_id IS NOT NULL)
       )
       OR (
         line.ffe_item_id IS NOT NULL
         AND NOT EXISTS (
           SELECT 1
           FROM public.project_ffe_items AS item
           WHERE item.id = line.ffe_item_id
             AND item.project_id = v_project.id
         )
       )
  ) THEN
    RAISE EXCEPTION 'invalid draft invoice payload'
      USING ERRCODE = 'check_violation';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(p_lines) AS line(milestone_id uuid)
    WHERE line.milestone_id IS NOT NULL
    GROUP BY line.milestone_id
    HAVING count(*) <> 1
  ) OR EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(p_lines) AS line(ffe_item_id uuid)
    WHERE line.ffe_item_id IS NOT NULL
    GROUP BY line.ffe_item_id
    HAVING count(*) <> 1
  ) THEN
    RAISE EXCEPTION 'invalid draft invoice payload'
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM public._invoice_billing_prelock(
    ARRAY(SELECT line.milestone_id FROM jsonb_to_recordset(p_lines) AS line(milestone_id uuid)),
    '{}'::uuid[], '{}'::uuid[],
    ARRAY(SELECT line.ffe_item_id FROM jsonb_to_recordset(p_lines) AS line(ffe_item_id uuid))
  );

  -- Milestones are mutable invoice latches. Lock distinct IDs in sorted
  -- UPDATE order before inserting a header or line so two composers cannot
  -- share-lock then deadlock while the line trigger advances the same latch.
  SELECT count(DISTINCT line.milestone_id) INTO v_expected_refs
  FROM jsonb_to_recordset(p_lines) AS line(milestone_id uuid)
  WHERE line.milestone_id IS NOT NULL;
  PERFORM milestone.id
  FROM (
    SELECT DISTINCT line.milestone_id, line.kind, line.quantity,
           line.unit_amount_cents
    FROM jsonb_to_recordset(p_lines) AS line(
      milestone_id uuid,
      kind text,
      quantity numeric,
      unit_amount_cents integer
    )
    WHERE line.milestone_id IS NOT NULL
  ) AS line
  JOIN public.project_payment_milestones AS milestone
    ON milestone.id = line.milestone_id
   AND milestone.project_id = v_project.id
   AND line.kind = 'milestone'
   AND line.quantity = 1
   AND line.unit_amount_cents = milestone.amount_cents
   AND milestone.invoice_id IS NULL
  ORDER BY milestone.id
  FOR UPDATE OF milestone;
  GET DIAGNOSTICS v_locked_refs = ROW_COUNT;
  IF v_locked_refs <> v_expected_refs THEN
    RAISE EXCEPTION 'invalid draft invoice payload'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT count(DISTINCT line.ffe_item_id) INTO v_expected_refs
  FROM jsonb_to_recordset(p_lines) AS line(ffe_item_id uuid)
  WHERE line.ffe_item_id IS NOT NULL;
  PERFORM item.id
  FROM jsonb_to_recordset(p_lines) AS line(ffe_item_id uuid)
  JOIN public.project_ffe_items AS item
    ON item.id = line.ffe_item_id
   AND item.project_id = v_project.id
  WHERE line.ffe_item_id IS NOT NULL
  ORDER BY item.id
  FOR SHARE OF item;
  GET DIAGNOSTICS v_locked_refs = ROW_COUNT;
  IF v_locked_refs <> v_expected_refs THEN
    RAISE EXCEPTION 'invalid draft invoice payload'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT COALESCE(sum(
    round(line.quantity * line.unit_amount_cents)::integer
  ), 0)::integer
  INTO v_subtotal
  FROM jsonb_to_recordset(p_lines) AS line(
    quantity numeric,
    unit_amount_cents integer
  );
  v_tax := round(v_subtotal * p_tax_rate)::integer;

  INSERT INTO public.invoices (
    project_id, designer_id, client_id, studio_id, status, currency,
    subtotal_cents, tax_rate, tax_cents, total_cents,
    payment_terms_days, memo, internal_notes
  ) VALUES (
    v_project.id, v_project.designer_id, v_project.client_id,
    v_project.studio_id, 'draft', 'USD', v_subtotal, p_tax_rate,
    v_tax, v_subtotal + v_tax, p_payment_terms_days,
    NULLIF(p_memo, ''), NULLIF(p_internal_notes, '')
  )
  RETURNING * INTO v_invoice;

  INSERT INTO public.invoice_line_items (
    invoice_id, kind, milestone_id, ffe_item_id, description, quantity,
    unit_amount_cents, amount_cents, metadata, sort_order
  )
  SELECT
    v_invoice.id, line.kind, line.milestone_id, line.ffe_item_id,
    btrim(line.description), line.quantity, line.unit_amount_cents,
    round(line.quantity * line.unit_amount_cents)::integer,
    COALESCE(line.metadata, '{}'::jsonb), line.sort_order
  FROM jsonb_to_recordset(p_lines) AS line(
    kind text,
    milestone_id uuid,
    ffe_item_id uuid,
    description text,
    quantity numeric,
    unit_amount_cents integer,
    metadata jsonb,
    sort_order integer
  )
  ORDER BY line.sort_order;

  SELECT * INTO STRICT v_invoice
  FROM public.invoices AS invoice
  WHERE invoice.id = v_invoice.id;
  RETURN v_invoice;
END;
$$;
