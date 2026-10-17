-- ═══════════════════════════════════════════════════════════════════════════
-- 00817 — US-36: invoice authority is scoped to the invoice's own studio
-- (SQ-1273; Astra SQ-1271 F3, inherited; R191)
--
-- can_manage_invoice (00397:1251–1264) asked _can_manage_invoice_owner(
-- i.designer_id), whose root _can_author_proposal (00387:533–559) admits the
-- invoice's designer or ANY active non-guest peer sharing ANY active design
-- studio with that designer. Nothing compared the invoice's studio. Designer
-- D sits in studios A and B; coworker C sits only in A. Knowing the id of an
-- invoice on D's studio-B job, C passed can_manage_invoice, so invoice-send
-- delivered it, and regenerate_invoice_link / get_invoice_link minted and
-- read its pay link.
--
-- The invoice's studio is invoices.studio_id (the 00318 issuing-studio
-- snapshot, immutable since 00511), else its project's studio_id. A caller is
-- admitted when she is:
--   · the invoice's own designer (unchanged, studio or not);
--   · the job's lead or team as can_buy_for_project (00813) defines them, on
--     a job whose studio IS the invoice's studio;
--   · an active owner/admin of the invoice's studio (is_org_admin_or_owner,
--     the K5 precedent of document_client_link_hold, 00796), when that
--     studio is an active design_studio: is_org_admin_or_owner reads the
--     seat alone (00484), so a suspended studio's owner would otherwise keep
--     the authority its suspension withdrew (SQ-1278 F1);
--   · an active non-guest member of the invoice's studio, when that studio is
--     an active design_studio in which the invoice's designer also holds an
--     active non-guest seat (today's _can_author_proposal arm, held to the
--     invoice's studio).
-- With no studio on the invoice or its project, only its own designer is
-- admitted. Nobody is admitted by profiles.role.
--
-- Narrowing: a peer of the designer from another studio no longer manages
-- the invoice. On a studio-less job, can_buy_for_project's co-member branch
-- is not consulted, since it admits through any of the lead's studios.
-- Widening (by design, R191): the invoice studio's owner/admin and the job's
-- team keep the invoice when its designer no longer holds a seat there.
--
-- Callers that inherit this (latest body each):
--   invoice-send (supabase/functions/invoice-send/index.ts) capability check;
--   regenerate_invoice_link, get_invoice_link (00636).
-- §2 re-points the money writes that checked _can_manage_invoice_owner(
-- designer_id) to can_manage_invoice(p_invoice_id), so a direct RPC call is
-- held to the same studio: issue_invoice (its guard is in
-- _issue_invoice_pre_00412, and public.issue_invoice now asks first),
-- record_invoice_payment, void_invoice and
-- add_invoice_billing_lines. Each refusal keeps its text and code, the same
-- for a missing invoice and a denied one.
-- Not re-pointed: generate_milestone_invoice (00397) authorizes the
-- milestone's project lead, not an invoice; app_private.issue_invoice_for_
-- actor (00578) already requires the actor's seat in the job's studio and
-- invoices.studio_id = projects.studio_id. _can_manage_invoice_owner keeps
-- its body for generate_milestone_invoice.
-- public.issue_invoice (00412) ran its linked-time and retainer checks before
-- that guard, so its check_violation told an outsider that an invoice had
-- pending linked time or an unpaid retainer (SQ-1278 F2). It now asks
-- can_manage_invoice first and refuses with the guard's own words; the two
-- checks follow unchanged.
--
-- Signature, LANGUAGE, volatility, SECURITY DEFINER, search_path and the ACL
-- of every function here are unchanged; CREATE OR REPLACE keeps each ACL, so
-- nothing here is replayed by seed/00-legacy-grants.sql. can_manage_invoice
-- is false whether or not the invoice exists.
--
-- Lineage: can_manage_invoice 00397 → 00817;
--   public.issue_invoice 00412 → 00817;
--   _issue_invoice_pre_00412 00397 (public.issue_invoice wrapper; renamed by
--   00412) → 00817; record_invoice_payment 00397 (wrapper) → 00817;
--   void_invoice 00397 (wrapper) → 00817; add_invoice_billing_lines
--   00709 → 00718 → 00817. No locks are added: can_manage_invoice only reads.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.can_manage_invoice(p_invoice_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.invoices AS invoice
    LEFT JOIN public.projects AS project ON project.id = invoice.project_id
    CROSS JOIN LATERAL (
      SELECT COALESCE(invoice.studio_id, project.studio_id) AS id
    ) AS invoice_studio
    WHERE invoice.id = p_invoice_id
      AND (SELECT auth.uid()) IS NOT NULL
      AND (
        invoice.designer_id = (SELECT auth.uid())
        OR (
          invoice_studio.id IS NOT NULL
          AND (
            (
              project.studio_id = invoice_studio.id
              AND public.can_buy_for_project(project.id)
            )
            -- is_org_admin_or_owner reads the seat only; 00556 keeps it blind
            -- to organizations.status for roster management. Invoice
            -- authority needs the studio itself active.
            OR (
              public.is_org_admin_or_owner(invoice_studio.id)
              AND EXISTS (
                SELECT 1
                FROM public.organizations AS studio
                WHERE studio.id = invoice_studio.id
                  AND studio.type = 'design_studio'
                  AND studio.status = 'active'
              )
            )
            OR EXISTS (
              SELECT 1
              FROM public.organization_members AS actor_membership
              JOIN public.organization_members AS owner_membership
                ON owner_membership.organization_id = actor_membership.organization_id
              JOIN public.organizations AS organization
                ON organization.id = actor_membership.organization_id
              WHERE actor_membership.organization_id = invoice_studio.id
                AND actor_membership.user_id = (SELECT auth.uid())
                AND actor_membership.status = 'active'
                AND actor_membership.role <> 'guest'
                AND owner_membership.user_id = invoice.designer_id
                AND owner_membership.status = 'active'
                AND owner_membership.role <> 'guest'
                AND organization.type = 'design_studio'
                AND organization.status = 'active'
            )
          )
        )
      )
  );
$$;

COMMENT ON FUNCTION public.can_manage_invoice(uuid) IS
  'Authenticated capability check shared by invoice-send, regenerate_invoice_link and get_invoice_link '
  '(00397, 00817 R191). True for the invoice''s designer; or, within the invoice''s studio '
  '(invoices.studio_id, else its project''s studio_id): the lead or team of a job in that studio '
  '(can_buy_for_project), an active owner/admin of that studio while it is an active design_studio, '
  'or an active non-guest member of that '
  'active design_studio in which the designer also holds an active non-guest seat. With no studio, only '
  'the designer. False for a missing invoice and for anyone else alike.';

-- ── 2. The money-write wrappers ask can_manage_invoice(p_invoice_id) ──────
-- Each body is its latest one, verbatim, with one line changed: the guard
-- `NOT public._can_manage_invoice_owner(v_invoice.designer_id)` now reads
-- `NOT public.can_manage_invoice(p_invoice_id)`. The invoice row is still
-- locked FOR UPDATE first and the refusal text and code are unchanged, the
-- same for a missing invoice and a denied one. CREATE OR REPLACE keeps each
-- ACL.

-- issue_invoice's guard: public.issue_invoice (00412, restated after this)
-- checks linked time and the retainer, then calls _issue_invoice_pre_00412,
-- the 00397 wrapper that 00412 renamed. That body holds the guard.
CREATE OR REPLACE FUNCTION public._issue_invoice_pre_00412(
  p_invoice_id uuid,
  p_due_date date DEFAULT NULL
)
RETURNS public.invoices
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_invoice public.invoices%ROWTYPE;
BEGIN
  SELECT * INTO v_invoice
  FROM public.invoices
  WHERE id = p_invoice_id
  FOR UPDATE;

  IF NOT FOUND OR NOT public.can_manage_invoice(p_invoice_id) THEN
    RAISE EXCEPTION 'issue_invoice: invoice % not found or access denied', p_invoice_id;
  END IF;

  RETURN public._issue_invoice_authorized_legacy_00397(p_invoice_id, p_due_date);
END;
$$;

-- public.issue_invoice: the 00412 body, the latest, with can_manage_invoice
-- asked before its linked-time and retainer checks. The refusal is the
-- guard's above, word for word and P0001, as for a missing invoice; the
-- checks after it are unchanged, and _issue_invoice_pre_00412 still locks the
-- row and asks again.
CREATE OR REPLACE FUNCTION public.issue_invoice(
  p_invoice_id uuid,
  p_due_date date DEFAULT NULL
)
RETURNS public.invoices
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.can_manage_invoice(p_invoice_id) THEN
    RAISE EXCEPTION 'issue_invoice: invoice % not found or access denied', p_invoice_id;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.project_time_entries t
    WHERE t.invoice_id = p_invoice_id AND t.billing_state <> 'authorized'
  ) THEN
    RAISE EXCEPTION 'issue_invoice: linked time includes entries pending authorization or nonbillable'
      USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.project_time_entries t
    JOIN public.project_billing_authorities a ON a.id = t.billing_authority_id
    WHERE t.invoice_id = p_invoice_id
      AND a.retainer_activation_policy = 'retainer_paid'
      AND NOT EXISTS (
        SELECT 1 FROM public.invoices ri WHERE ri.id = a.retainer_invoice_id
          AND ri.status = 'paid' AND ri.amount_paid_cents >= ri.total_cents
      )
  ) THEN
    RAISE EXCEPTION 'issue_invoice: signed retainer invoice must be paid first'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN public._issue_invoice_pre_00412(p_invoice_id, p_due_date);
END;
$$;

CREATE OR REPLACE FUNCTION public.record_invoice_payment(
  p_invoice_id uuid,
  p_amount_cents integer,
  p_method text,
  p_reference text DEFAULT NULL,
  p_received_at timestamptz DEFAULT now(),
  p_note text DEFAULT NULL
)
RETURNS public.invoice_payments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_invoice public.invoices%ROWTYPE;
BEGIN
  SELECT * INTO v_invoice
  FROM public.invoices
  WHERE id = p_invoice_id
  FOR UPDATE;

  IF NOT FOUND OR NOT public.can_manage_invoice(p_invoice_id) THEN
    RAISE EXCEPTION 'record_invoice_payment: invoice % not found or access denied', p_invoice_id;
  END IF;

  RETURN public._record_invoice_payment_authorized_legacy_00397(
    p_invoice_id,
    p_amount_cents,
    p_method,
    p_reference,
    p_received_at,
    p_note
  );
END;
$$;

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
  SELECT * INTO v_invoice
  FROM public.invoices
  WHERE id = p_invoice_id
  FOR UPDATE;

  IF NOT FOUND OR NOT public.can_manage_invoice(p_invoice_id) THEN
    RAISE EXCEPTION 'void_invoice: invoice % not found or access denied', p_invoice_id;
  END IF;

  RETURN public._void_invoice_authorized_legacy_00397(p_invoice_id, p_reason);
END;
$$;

-- add_invoice_billing_lines: the 00718 body (00709 → 00718).
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

  SELECT * INTO v_invoice FROM public.invoices WHERE id = p_invoice_id FOR UPDATE;
  IF NOT FOUND OR NOT public.can_manage_invoice(p_invoice_id) THEN
    RAISE EXCEPTION 'add_invoice_billing_lines: invoice % not found or access denied', p_invoice_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;
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
        jsonb_build_object('studioPurchaseId', v_purchase.id, 'billingRule', v_purchase.billing_rule,
                           'costCents', v_cost),
        v_sort
      )
      RETURNING * INTO v_line;

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
                           'riderKind', v_rider.kind, 'billingRule', v_rider.billing_rule,
                           'costCents', v_cost),
        v_sort
      )
      RETURNING * INTO v_line;

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
