-- ═══════════════════════════════════════════════════════════════════════════
-- 00823 — Scrub compound invoice economics without re-latching issued milestones.
-- Metadata classifier/backfill lineage: 00822. Milestone latch lineage: 00397.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.sync_invoice_line_milestone_latch()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_invoice          invoices%ROWTYPE;
  v_previous_invoice invoices%ROWTYPE;
  v_milestone        project_payment_milestones%ROWTYPE;
  v_project          projects%ROWTYPE;
  v_detach           boolean := false;
BEGIN
  -- Nothing about the invoice/milestone identity or amount changed. In
  -- particular, an issued line's metadata scrub must not re-latch it.
  IF TG_OP = 'UPDATE'
     AND (to_jsonb(NEW) - 'metadata') = (to_jsonb(OLD) - 'metadata') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    v_detach := OLD.milestone_id IS NOT NULL;
  ELSIF TG_OP = 'UPDATE' THEN
    v_detach := OLD.milestone_id IS NOT NULL
      AND (
        OLD.milestone_id IS DISTINCT FROM NEW.milestone_id
        OR OLD.invoice_id IS DISTINCT FROM NEW.invoice_id
      );
  END IF;

  IF v_detach THEN
    SELECT * INTO v_previous_invoice
    FROM invoices
    WHERE id = OLD.invoice_id;

    IF FOUND
       AND v_previous_invoice.status NOT IN ('draft','void')
       AND EXISTS (
         SELECT 1
         FROM project_payment_milestones m
         WHERE m.id = OLD.milestone_id
           AND m.invoice_id = OLD.invoice_id
       ) THEN
      RAISE EXCEPTION
        'invoice milestone latch: cannot detach milestone % from % invoice %',
        OLD.milestone_id, v_previous_invoice.status, OLD.invoice_id
        USING ERRCODE = '23514';
    END IF;

    UPDATE project_payment_milestones
    SET invoice_id = NULL,
        status = 'pending',
        due_date = NULL,
        paid_at = NULL,
        updated_at = now()
    WHERE id = OLD.milestone_id
      AND invoice_id = OLD.invoice_id;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  IF NEW.milestone_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_invoice
  FROM invoices
  WHERE id = NEW.invoice_id;
  IF NOT FOUND OR v_invoice.status <> 'draft' THEN
    RAISE EXCEPTION
      'invoice milestone latch: invoice % is missing or not draft', NEW.invoice_id
      USING ERRCODE = '23514';
  END IF;

  SELECT * INTO v_milestone
  FROM project_payment_milestones
  WHERE id = NEW.milestone_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION
      'invoice milestone latch: milestone % not found', NEW.milestone_id
      USING ERRCODE = '23514';
  END IF;

  SELECT * INTO v_project
  FROM projects
  WHERE id = v_milestone.project_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION
      'invoice milestone latch: project % not found', v_milestone.project_id
      USING ERRCODE = '23514';
  END IF;

  -- Direct browser writes execute as authenticated and must prove exact
  -- design-studio authority. Nested SECURITY DEFINER billing workflows execute
  -- as postgres and have already performed their own domain authorization.
  IF current_user = 'authenticated'
     AND NOT EXISTS (
       SELECT 1
       WHERE v_project.designer_id = auth.uid()
          OR EXISTS (
            SELECT 1
            FROM organization_members actor_membership
            JOIN organization_members owner_membership
              ON owner_membership.organization_id = actor_membership.organization_id
            JOIN organizations organization
              ON organization.id = actor_membership.organization_id
            WHERE actor_membership.user_id = auth.uid()
              AND actor_membership.status = 'active'
              AND actor_membership.role <> 'guest'
              AND owner_membership.user_id = v_project.designer_id
              AND owner_membership.status = 'active'
              AND owner_membership.role <> 'guest'
              AND organization.type = 'design_studio'
              AND organization.status = 'active'
          )
     ) THEN
    RAISE EXCEPTION
      'invoice milestone latch: milestone % not found or access denied', NEW.milestone_id
      USING ERRCODE = '42501';
  END IF;

  IF v_invoice.project_id IS DISTINCT FROM v_milestone.project_id
     OR v_invoice.client_id IS DISTINCT FROM v_project.client_id
     OR (
       v_invoice.designer_id = v_project.designer_id
       OR EXISTS (
         SELECT 1
         FROM organization_members invoice_member
         JOIN organization_members project_member
           ON project_member.organization_id = invoice_member.organization_id
         JOIN organizations organization
           ON organization.id = invoice_member.organization_id
         WHERE invoice_member.user_id = v_invoice.designer_id
           AND invoice_member.status = 'active'
           AND invoice_member.role <> 'guest'
           AND project_member.user_id = v_project.designer_id
           AND project_member.status = 'active'
           AND project_member.role <> 'guest'
           AND organization.type = 'design_studio'
           AND organization.status = 'active'
       )
     ) IS NOT TRUE
     OR NEW.kind IS DISTINCT FROM 'milestone'
     OR NEW.quantity IS DISTINCT FROM 1
     OR NEW.unit_amount_cents IS DISTINCT FROM v_milestone.amount_cents
     OR NEW.amount_cents IS DISTINCT FROM v_milestone.amount_cents THEN
    RAISE EXCEPTION
      'invoice milestone latch: line % does not exactly match milestone %',
      NEW.id, NEW.milestone_id
      USING ERRCODE = '23514';
  END IF;

  IF v_milestone.status = 'paid' THEN
    RAISE EXCEPTION
      'invoice milestone latch: paid milestone % cannot be attached to a draft invoice',
      NEW.milestone_id
      USING ERRCODE = '23514';
  END IF;

  IF v_milestone.invoice_id IS NOT NULL
     AND v_milestone.invoice_id <> NEW.invoice_id THEN
    SELECT * INTO v_previous_invoice
    FROM invoices
    WHERE id = v_milestone.invoice_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION
        'invoice milestone latch: existing invoice % is unavailable for milestone %',
        v_milestone.invoice_id, NEW.milestone_id
        USING ERRCODE = '23514';
    ELSIF v_previous_invoice.status <> 'void'
       AND (
         v_previous_invoice.status = 'draft'
         AND v_previous_invoice.project_id = v_milestone.project_id
         AND v_previous_invoice.designer_id IS NOT DISTINCT FROM v_invoice.designer_id
         AND v_previous_invoice.client_id IS NOT DISTINCT FROM v_invoice.client_id
         AND v_previous_invoice.currency IS NOT DISTINCT FROM v_invoice.currency
         AND v_previous_invoice.subtotal_cents = v_milestone.amount_cents
         AND v_previous_invoice.tax_cents = 0
         AND v_previous_invoice.total_cents = v_milestone.amount_cents
         AND v_previous_invoice.amount_paid_cents = 0
         AND v_previous_invoice.stripe_checkout_session_id IS NULL
         AND NOT EXISTS (
           SELECT 1 FROM invoice_line_items x
           WHERE x.invoice_id = v_previous_invoice.id
         )
         AND NOT EXISTS (
           SELECT 1 FROM invoice_payments p
           WHERE p.invoice_id = v_previous_invoice.id
         )
         AND NOT EXISTS (
           SELECT 1 FROM invoice_checkout_attempts a
           WHERE a.invoice_id = v_previous_invoice.id
         )
         AND NOT EXISTS (
           SELECT 1 FROM project_time_entries t
           WHERE t.invoice_id = v_previous_invoice.id
         )
         AND NOT EXISTS (
           SELECT 1 FROM designer_earnings e
           WHERE e.invoice_id = v_previous_invoice.id
         )
         AND NOT EXISTS (
           SELECT 1 FROM concierge_orders o
           WHERE o.client_invoice_id = v_previous_invoice.id
         )
       ) IS NOT TRUE THEN
      RAISE EXCEPTION
        'invoice milestone latch: milestone % is already latched to invoice %',
        NEW.milestone_id, v_milestone.invoice_id
        USING ERRCODE = '23514';
    END IF;
  END IF;

  UPDATE project_payment_milestones
  SET invoice_id = NEW.invoice_id,
      status = 'pending',
      due_date = NULL,
      paid_at = NULL,
      updated_at = now()
  WHERE id = NEW.milestone_id;

  RETURN NEW;
END;
$$;

-- UUID-valued *Id and *_id keys are references, not economic amounts.
-- Non-UUID values retain the ordinary private-key classification.
CREATE OR REPLACE FUNCTION public._invoice_line_private_key(p_key text)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT lower(p_key) ~ '(cost|msrp|wholesale|trade|markup|margin|retail)'
$$;

-- The latest body is 00822; preserve UUID-valued identifier references.
CREATE OR REPLACE FUNCTION public._invoice_line_public_metadata(p_metadata jsonb)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE v_public jsonb;
BEGIN
  IF jsonb_typeof(p_metadata) = 'object' THEN
    SELECT COALESCE(jsonb_object_agg(key, public._invoice_line_public_metadata(value)), '{}'::jsonb)
      INTO v_public FROM jsonb_each(p_metadata)
     WHERE NOT public._invoice_line_private_key(key)
        OR (key ~ '(Id|_id)$' AND jsonb_typeof(value) = 'string'
            AND value #>> '{}' ~* '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$');
    RETURN v_public;
  ELSIF jsonb_typeof(p_metadata) = 'array' THEN
    SELECT COALESCE(jsonb_agg(public._invoice_line_public_metadata(value) ORDER BY ord), '[]'::jsonb)
      INTO v_public FROM jsonb_array_elements(p_metadata) WITH ORDINALITY AS element(value, ord);
    RETURN v_public;
  END IF;
  RETURN p_metadata;
END;
$$;

-- 00822 archived complete metadata objects. Merge new private paths recursively
-- so a later scrub cannot replace previously archived object or array entries.
CREATE OR REPLACE FUNCTION public._invoice_line_merge_archived_metadata(p_existing jsonb, p_new jsonb)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE
  v_result jsonb;
  v_key text;
  v_value jsonb;
  v_index bigint;
BEGIN
  IF p_existing IS NULL THEN RETURN p_new; END IF;
  IF p_new IS NULL THEN RETURN p_existing; END IF;
  IF jsonb_typeof(p_existing) = 'object' AND jsonb_typeof(p_new) = 'object' THEN
    v_result := p_existing;
    FOR v_key, v_value IN SELECT key, value FROM jsonb_each(p_new) LOOP
      v_result := jsonb_set(v_result, ARRAY[v_key],
        public._invoice_line_merge_archived_metadata(p_existing->v_key, v_value), true);
    END LOOP;
    RETURN v_result;
  ELSIF jsonb_typeof(p_existing) = 'array' AND jsonb_typeof(p_new) = 'array' THEN
    v_result := p_existing;
    FOR v_value, v_index IN SELECT value, ord - 1 FROM jsonb_array_elements(p_new) WITH ORDINALITY AS item(value, ord) LOOP
      v_result := jsonb_set(v_result, ARRAY[v_index::text],
        public._invoice_line_merge_archived_metadata(p_existing->(v_index::integer), v_value), true);
    END LOOP;
    RETURN v_result;
  END IF;
  RETURN p_existing;
END;
$$;

-- Keep 00822's fresh-line INSERT unchanged; only existing archives need a merge.
CREATE OR REPLACE FUNCTION public._move_invoice_line_internal_metadata()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.invoice_line_item_internals (line_item_id, internal_metadata)
  SELECT id, metadata FROM public.invoice_line_items
   WHERE metadata <> public._invoice_line_public_metadata(metadata)
  ON CONFLICT (line_item_id) DO UPDATE
    SET internal_metadata = public._invoice_line_merge_archived_metadata(
      invoice_line_item_internals.internal_metadata, EXCLUDED.internal_metadata);

  UPDATE public.invoice_line_items
     SET metadata = public._invoice_line_public_metadata(metadata)
   WHERE metadata <> public._invoice_line_public_metadata(metadata);
END;
$$;

-- Replacing the constraint also refreshes its predicate on repeat applies.
-- Drop before scrubbing so legacy issued rows can be updated by the helper.
ALTER TABLE public.invoice_line_items
  DROP CONSTRAINT IF EXISTS invoice_line_items_public_metadata_ck;
SELECT public._move_invoice_line_internal_metadata();
ALTER TABLE public.invoice_line_items
  ADD CONSTRAINT invoice_line_items_public_metadata_ck
  CHECK (metadata = public._invoice_line_public_metadata(metadata)) NOT VALID;
ALTER TABLE public.invoice_line_items VALIDATE CONSTRAINT invoice_line_items_public_metadata_ck;
