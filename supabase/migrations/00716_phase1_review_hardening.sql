-- ═══════════════════════════════════════════════════════════════════════════
-- 00716 — Phase 1 review hardening (SQ-443; SQ-416 review findings)
-- ═══════════════════════════════════════════════════════════════════════════
-- US-16 Phase 1. Rolls forward over 00184, 00695, 00696, 00697 and 00713;
-- none of those files is edited.
--
-- F1  flip_pending_balance_to_due (00184) is SECURITY DEFINER with no authz
--     and was executable by anon and authenticated. It is now service_role
--     only. Its two callers, po_status_cascade_to_items and
--     deposit_paid_flips_balance (00184, never redefined), are SECURITY
--     DEFINER trigger functions owned by postgres, so they keep EXECUTE
--     through the owner whoever made the triggering write
--     (advance_purchase_order_status, a vendor_payments derive, the
--     stripe-webhook). No app code calls it directly.
--
-- F2  procurement_notifications keeps only UPDATE (read_at) for
--     authenticated. The own-row UPDATE policy checks user_id alone, so a
--     user could repoint subject_purchase_order_id or kind at another
--     studio's PO and have it surface through the 00700 co-member read.
--     Every writer is a SECURITY DEFINER trigger (00700 notify_payment_due,
--     notify_damage_claim_drafted, sweep_procurement_clocks), a pg_cron job
--     (postgres) or the stripe-webhook (service_role). The one client write
--     is useMarkProcurementNotificationRead's .update({ read_at }).
--
-- F6  _sync_studio_owner_role (00713) put every active design-studio owner
--     seat on studio_owner when the seat moved. For an owner created with
--     admin_create_studio_for_user(p_grant_designer_role => false) a later
--     status or role update would grant studio_owner, overriding that choice
--     and tripping fc_sync_is_designer_from_role (is_designer is one-way). It
--     now grants only to a user who already holds a designer-domain role
--     (has_designer_domain_role, 00511). Transfer and promotion between users
--     who hold one are unchanged; removal is unchanged. The 00713 backfill
--     stands.
--
-- Minor
--   (a) record_vendor_payment refuses a scheduled row already 'refunded'.
--   (b) studio_vendor_accounts and studio_locations (policies and the five
--       RPCs) admit an active non-guest member of an ACTIVE studio:
--       is_active_studio_member → is_active_org_member (00556), the predicate
--       studio_payment_methods already uses. A suspended studio's members
--       neither read nor write them. studio_contacts keeps
--       is_active_studio_member (out of scope).
--
-- Function bodies below are the latest definitions verbatim except for the
-- marked changes. CREATE OR REPLACE keeps each function's ACL and comment.
-- Adds GRANT/REVOKE → supabase/seed/00-legacy-grants.sql regenerated.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── F1. flip_pending_balance_to_due: service_role only ─────────────────────

REVOKE EXECUTE ON FUNCTION public.flip_pending_balance_to_due(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.flip_pending_balance_to_due(uuid) TO service_role;

-- ─── F2. procurement_notifications: clients may only mark read ──────────────
-- Revoking table-level UPDATE drops column grants too, so the column grant
-- comes after.

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.procurement_notifications FROM anon, authenticated;
GRANT UPDATE (read_at) ON public.procurement_notifications TO authenticated;

-- ─── F6. studio_owner is granted only alongside a designer-domain role ──────

CREATE OR REPLACE FUNCTION public._sync_studio_owner_role(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_role_id uuid;
BEGIN
  SELECT id INTO v_role_id FROM public.roles WHERE name = 'studio_owner';
  IF v_role_id IS NULL OR p_user_id IS NULL THEN
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.organization_members AS membership
    JOIN public.organizations AS org ON org.id = membership.organization_id
    WHERE membership.user_id = p_user_id
      AND membership.role = 'owner'
      AND membership.status = 'active'
      AND org.type = 'design_studio'
  ) THEN
    -- 00716: only for a user who already holds a designer-domain role, so an
    -- owner seated without one (p_grant_designer_role => false) stays without.
    IF public.has_designer_domain_role(p_user_id) THEN
      -- The profile check keeps a cascading profile delete from re-inserting
      -- a grant for a row that is going away.
      INSERT INTO public.user_roles (user_id, role_id)
      SELECT p_user_id, v_role_id
      WHERE EXISTS (SELECT 1 FROM public.profiles WHERE id = p_user_id)
      ON CONFLICT (user_id, role_id) DO NOTHING;
    END IF;
  ELSIF EXISTS (
    SELECT 1
    FROM public.user_roles AS grant_row
    JOIN public.roles AS role ON role.id = grant_row.role_id
    WHERE grant_row.user_id = p_user_id
      AND grant_row.role_id <> v_role_id
      AND role.domain IN ('designer', 'admin')
  ) THEN
    DELETE FROM public.user_roles
    WHERE user_id = p_user_id AND role_id = v_role_id;
  END IF;
END;
$$;

COMMENT ON FUNCTION public._sync_studio_owner_role(uuid) IS
  'Internal (00713, R-PB6; narrowed 00716): when an owner seat moves (transfer, promotion, demotion, '
  'status change, delete), a user who holds an active owner seat in a design studio AND already holds '
  'a designer-domain role is put on user_roles.studio_owner; it is removed once they hold no owner seat, '
  'unless it is their only designer- or admin-domain role (the designer portal admits on that domain). '
  'A new owner seat is not a sync event.';

-- ─── (b) studio_vendor_accounts / studio_locations: active studios only ─────

ALTER POLICY studio_vendor_accounts_member_select ON public.studio_vendor_accounts
  USING (public.is_active_org_member(organization_id));

ALTER POLICY studio_locations_member_select ON public.studio_locations
  USING (public.is_active_org_member(organization_id));

-- 00696 / 00697 RPCs: the membership check is the only change.


CREATE OR REPLACE FUNCTION public.get_studio_vendor_accounts(
  p_org uuid, p_vendor_id uuid DEFAULT NULL
)
RETURNS SETOF public.studio_vendor_accounts
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_mask jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_active_org_member(p_org) THEN
    RETURN;
  END IF;
  v_mask := CASE WHEN public.can_see_studio_margin(p_org)
                 THEN '{}'::jsonb
                 ELSE '{"trade_discount_pct": null}'::jsonb END;

  RETURN QUERY
  SELECT (jsonb_populate_record(account, v_mask)).*
  FROM public.studio_vendor_accounts AS account
  WHERE account.organization_id = p_org
    AND (p_vendor_id IS NULL OR account.vendor_id = p_vendor_id)
  ORDER BY account.archived_at NULLS FIRST, account.created_at, account.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.upsert_studio_vendor_account(
  p_org uuid, p_vendor_id uuid, p_request jsonb
)
RETURNS public.studio_vendor_accounts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_uid     uuid := auth.uid();
  v_req     jsonb := COALESCE(p_request, '{}'::jsonb);
  v_unknown text;
  v_patch   jsonb;
  v_row     public.studio_vendor_accounts%ROWTYPE;
  v_new     public.studio_vendor_accounts%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'upsert_studio_vendor_account: not authenticated'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_org IS NULL OR NOT public.is_active_org_member(p_org) THEN
    RAISE EXCEPTION 'upsert_studio_vendor_account: studio % not found or access denied', p_org
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF jsonb_typeof(v_req) <> 'object' THEN
    RAISE EXCEPTION 'upsert_studio_vendor_account: request must be a JSON object'
      USING ERRCODE = 'check_violation';
  END IF;

  WITH m(key, col) AS (VALUES
    ('studioContactId', 'studio_contact_id'),
    ('accountStatus', 'account_status'),
    ('accountNumber', 'account_number'),
    ('accountOpenedOn', 'account_opened_on'),
    ('tierLabel', 'tier_label'),
    ('repContactId', 'rep_contact_id'),
    ('creditLimitCents', 'credit_limit_cents'),
    ('paymentPattern', 'payment_pattern'),
    ('depositPct', 'deposit_pct'),
    ('netDays', 'net_days'),
    ('tradeDiscountPct', 'trade_discount_pct'),
    ('paymentMethodId', 'payment_method_id'),
    ('transmission', 'transmission'),
    ('ordersEmailOverride', 'orders_email_override'),
    ('portalUrl', 'portal_url'),
    ('leadTimeDays', 'lead_time_days'),
    ('quoteValidityDays', 'quote_validity_days'),
    ('changeWindowDays', 'change_window_days'),
    ('claimsWindowDays', 'claims_window_days'),
    ('inspectionWindowDays', 'inspection_window_days'),
    ('restockingPct', 'restocking_pct'),
    ('freightPolicy', 'freight_policy'),
    ('blindShip', 'blind_ship'),
    ('resaleCertOnFileOn', 'resale_cert_on_file_on'),
    ('resaleCertState', 'resale_cert_state'),
    ('notes', 'notes')
  )
  SELECT
    (SELECT string_agg(k, ', ' ORDER BY k)
       FROM jsonb_object_keys(v_req) AS k
      WHERE k <> 'archived' AND NOT EXISTS (SELECT 1 FROM m WHERE m.key = k)),
    (SELECT COALESCE(jsonb_object_agg(m.col, v_req -> m.key), '{}'::jsonb)
       FROM m WHERE v_req ? m.key)
  INTO v_unknown, v_patch;

  IF v_unknown IS NOT NULL THEN
    RAISE EXCEPTION 'upsert_studio_vendor_account: unknown keys %', v_unknown
      USING ERRCODE = 'check_violation';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.vendors WHERE id = p_vendor_id) THEN
    RAISE EXCEPTION 'upsert_studio_vendor_account: vendor % not found', p_vendor_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  -- R1: whoever cannot see the studio's margin cannot set it either.
  IF v_req ? 'tradeDiscountPct' AND NOT public.can_see_studio_margin(p_org) THEN
    RAISE EXCEPTION 'upsert_studio_vendor_account: this studio shows trade discounts to owners and admins only'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  INSERT INTO public.studio_vendor_accounts (organization_id, vendor_id, created_by, updated_by)
  VALUES (p_org, p_vendor_id, v_uid, v_uid)
  ON CONFLICT (organization_id, vendor_id) DO NOTHING;

  SELECT * INTO v_row
  FROM public.studio_vendor_accounts
  WHERE organization_id = p_org AND vendor_id = p_vendor_id
  FOR UPDATE;

  -- Unset columns keep v_row's values; a JSON null clears. Type errors
  -- (a non-uuid id, a fractional day count, an unknown enum label) raise.
  v_new := jsonb_populate_record(v_row, v_patch);

  IF v_req ? 'archived' THEN
    IF jsonb_typeof(v_req -> 'archived') <> 'boolean' THEN
      RAISE EXCEPTION 'upsert_studio_vendor_account: archived must be true or false'
        USING ERRCODE = 'check_violation';
    END IF;
    v_new.archived_at := CASE WHEN (v_req -> 'archived') = 'true'::jsonb
                              THEN COALESCE(v_row.archived_at, now()) END;
  END IF;

  IF v_new.studio_contact_id IS DISTINCT FROM v_row.studio_contact_id
     AND v_new.studio_contact_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM public.studio_contacts
       WHERE id = v_new.studio_contact_id AND organization_id = p_org AND entity_kind = 'company'
     ) THEN
    RAISE EXCEPTION 'upsert_studio_vendor_account: studio contact % is not a company card in this studio', v_new.studio_contact_id
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_new.rep_contact_id IS DISTINCT FROM v_row.rep_contact_id
     AND v_new.rep_contact_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM public.studio_contacts
       WHERE id = v_new.rep_contact_id AND organization_id = p_org AND entity_kind = 'person'
     ) THEN
    RAISE EXCEPTION 'upsert_studio_vendor_account: rep % is not a person card in this studio', v_new.rep_contact_id
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_new.payment_method_id IS DISTINCT FROM v_row.payment_method_id
     AND v_new.payment_method_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM public.studio_payment_methods
       WHERE id = v_new.payment_method_id AND organization_id = p_org AND archived_at IS NULL
     ) THEN
    RAISE EXCEPTION 'upsert_studio_vendor_account: payment method % is not a live method of this studio', v_new.payment_method_id
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.studio_vendor_accounts SET
    studio_contact_id      = v_new.studio_contact_id,
    account_status         = v_new.account_status,
    account_number         = NULLIF(btrim(v_new.account_number), ''),
    account_opened_on      = v_new.account_opened_on,
    tier_label             = NULLIF(btrim(v_new.tier_label), ''),
    rep_contact_id         = v_new.rep_contact_id,
    credit_limit_cents     = v_new.credit_limit_cents,
    payment_pattern        = v_new.payment_pattern,
    deposit_pct            = v_new.deposit_pct,
    net_days               = v_new.net_days,
    trade_discount_pct     = v_new.trade_discount_pct,
    payment_method_id      = v_new.payment_method_id,
    transmission           = v_new.transmission,
    orders_email_override  = NULLIF(lower(btrim(v_new.orders_email_override)), ''),
    portal_url             = NULLIF(btrim(v_new.portal_url), ''),
    lead_time_days         = v_new.lead_time_days,
    quote_validity_days    = v_new.quote_validity_days,
    change_window_days     = v_new.change_window_days,
    claims_window_days     = v_new.claims_window_days,
    inspection_window_days = v_new.inspection_window_days,
    restocking_pct         = v_new.restocking_pct,
    freight_policy         = NULLIF(btrim(v_new.freight_policy), ''),
    blind_ship             = v_new.blind_ship,
    resale_cert_on_file_on = v_new.resale_cert_on_file_on,
    resale_cert_state      = NULLIF(upper(btrim(v_new.resale_cert_state)), ''),
    notes                  = NULLIF(btrim(v_new.notes), ''),
    archived_at            = v_new.archived_at,
    updated_by             = v_uid
  WHERE id = v_row.id
  RETURNING * INTO v_new;

  IF NOT public.can_see_studio_margin(p_org) THEN
    v_new.trade_discount_pct := NULL;
  END IF;
  RETURN v_new;
END;
$$;

CREATE OR REPLACE FUNCTION public.upsert_studio_location(p_org uuid, p_request jsonb)
RETURNS public.studio_locations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_uid     uuid := auth.uid();
  v_req     jsonb := COALESCE(p_request, '{}'::jsonb);
  v_id      uuid;
  v_unknown text;
  v_patch   jsonb;
  v_row     public.studio_locations%ROWTYPE;
  v_new     public.studio_locations%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'upsert_studio_location: not authenticated'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_org IS NULL OR NOT public.is_active_org_member(p_org) THEN
    RAISE EXCEPTION 'upsert_studio_location: studio % not found or access denied', p_org
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF jsonb_typeof(v_req) <> 'object' THEN
    RAISE EXCEPTION 'upsert_studio_location: request must be a JSON object'
      USING ERRCODE = 'check_violation';
  END IF;

  WITH m(key, col) AS (VALUES
    ('kind', 'kind'),
    ('studioContactId', 'studio_contact_id'),
    ('label', 'label'),
    ('address', 'address'),
    ('receivingHours', 'receiving_hours'),
    ('hasDock', 'has_dock'),
    ('needsLiftgate', 'needs_liftgate'),
    ('storageFreeDays', 'storage_free_days'),
    ('storageRateCentsMonth', 'storage_rate_cents_month'),
    ('receivingFeeCentsPiece', 'receiving_fee_cents_piece'),
    ('instructions', 'instructions'),
    ('isDefaultReceiver', 'is_default_receiver')
  )
  SELECT
    (SELECT string_agg(k, ', ' ORDER BY k)
       FROM jsonb_object_keys(v_req) AS k
      WHERE k <> 'id' AND NOT EXISTS (SELECT 1 FROM m WHERE m.key = k)),
    (SELECT COALESCE(jsonb_object_agg(m.col, v_req -> m.key), '{}'::jsonb)
       FROM m WHERE v_req ? m.key)
  INTO v_unknown, v_patch;

  IF v_unknown IS NOT NULL THEN
    RAISE EXCEPTION 'upsert_studio_location: unknown keys %', v_unknown
      USING ERRCODE = 'check_violation';
  END IF;

  -- Serialize default-receiver moves within the studio.
  PERFORM 1 FROM public.organizations WHERE id = p_org FOR UPDATE;

  v_id := NULLIF(v_req ->> 'id', '')::uuid;
  IF v_id IS NOT NULL THEN
    SELECT * INTO v_row FROM public.studio_locations
    WHERE id = v_id AND organization_id = p_org
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'upsert_studio_location: location % not found or access denied', v_id
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF v_row.archived_at IS NOT NULL THEN
      RAISE EXCEPTION 'upsert_studio_location: location % is archived; restore it first', v_id
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  v_new := jsonb_populate_record(v_row, v_patch);
  v_new.label := NULLIF(btrim(v_new.label), '');
  v_new.is_default_receiver := COALESCE(v_new.is_default_receiver, false);

  IF v_new.kind IS NULL OR v_new.label IS NULL THEN
    RAISE EXCEPTION 'upsert_studio_location: a kind and a label are required'
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_new.studio_contact_id IS DISTINCT FROM v_row.studio_contact_id
     AND v_new.studio_contact_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM public.studio_contacts
       WHERE id = v_new.studio_contact_id AND organization_id = p_org AND entity_kind = 'company'
     ) THEN
    RAISE EXCEPTION 'upsert_studio_location: studio contact % is not a company card in this studio', v_new.studio_contact_id
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_new.is_default_receiver THEN
    UPDATE public.studio_locations
       SET is_default_receiver = false, updated_by = v_uid
     WHERE organization_id = p_org
       AND is_default_receiver
       AND id IS DISTINCT FROM v_id;
  END IF;

  IF v_id IS NULL THEN
    INSERT INTO public.studio_locations (
      organization_id, kind, studio_contact_id, label, address, receiving_hours,
      has_dock, needs_liftgate, storage_free_days, storage_rate_cents_month,
      receiving_fee_cents_piece, instructions, is_default_receiver, created_by, updated_by
    )
    VALUES (
      p_org, v_new.kind, v_new.studio_contact_id, v_new.label, v_new.address,
      NULLIF(btrim(v_new.receiving_hours), ''), v_new.has_dock, v_new.needs_liftgate,
      v_new.storage_free_days, v_new.storage_rate_cents_month, v_new.receiving_fee_cents_piece,
      NULLIF(btrim(v_new.instructions), ''), v_new.is_default_receiver, v_uid, v_uid
    )
    RETURNING * INTO v_new;
  ELSE
    UPDATE public.studio_locations SET
      kind                      = v_new.kind,
      studio_contact_id         = v_new.studio_contact_id,
      label                     = v_new.label,
      address                   = v_new.address,
      receiving_hours           = NULLIF(btrim(v_new.receiving_hours), ''),
      has_dock                  = v_new.has_dock,
      needs_liftgate            = v_new.needs_liftgate,
      storage_free_days         = v_new.storage_free_days,
      storage_rate_cents_month  = v_new.storage_rate_cents_month,
      receiving_fee_cents_piece = v_new.receiving_fee_cents_piece,
      instructions              = NULLIF(btrim(v_new.instructions), ''),
      is_default_receiver       = v_new.is_default_receiver,
      updated_by                = v_uid
    WHERE id = v_id
    RETURNING * INTO v_new;
  END IF;

  RETURN v_new;
END;
$$;

CREATE OR REPLACE FUNCTION public.archive_studio_location(
  p_location_id uuid, p_archived boolean DEFAULT true
)
RETURNS public.studio_locations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_row public.studio_locations%ROWTYPE;
BEGIN
  SELECT * INTO v_row FROM public.studio_locations WHERE id = p_location_id FOR UPDATE;
  IF NOT FOUND OR auth.uid() IS NULL OR NOT public.is_active_org_member(v_row.organization_id) THEN
    RAISE EXCEPTION 'archive_studio_location: location % not found or access denied', p_location_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  UPDATE public.studio_locations SET
    archived_at = CASE WHEN COALESCE(p_archived, true) THEN COALESCE(archived_at, now()) END,
    is_default_receiver = CASE WHEN COALESCE(p_archived, true) THEN false ELSE is_default_receiver END,
    updated_by = auth.uid()
  WHERE id = p_location_id
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_purchase_order_ship_to_location(
  p_po_id uuid, p_location_id uuid
)
RETURNS public.purchase_orders
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $$
DECLARE
  v_po       public.purchase_orders%ROWTYPE;
  v_project  public.projects%ROWTYPE;
  v_loc      public.studio_locations%ROWTYPE;
  v_ours     boolean;
  v_snapshot text;
BEGIN
  SELECT * INTO v_po FROM public.purchase_orders WHERE id = p_po_id FOR UPDATE;
  IF NOT FOUND OR NOT public.can_send_purchase_order(p_po_id) THEN
    RAISE EXCEPTION 'set_purchase_order_ship_to_location: purchase order % not found or access denied', p_po_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  -- Same rule as set_purchase_order_ship_to (00690): after send, a missing
  -- ship-to may be filled, but one already on sent paper is fixed (R8).
  IF v_po.sent_at IS NOT NULL AND NULLIF(btrim(COALESCE(v_po.ship_to, '')), '') IS NOT NULL THEN
    RAISE EXCEPTION 'set_purchase_order_ship_to_location: purchase order % was already sent; ship-to is fixed on sent paper', p_po_id
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_po.status = 'cancelled' THEN
    RAISE EXCEPTION 'set_purchase_order_ship_to_location: purchase order % is cancelled', p_po_id
      USING ERRCODE = 'check_violation';
  END IF;

  IF p_location_id IS NOT NULL THEN
    SELECT * INTO v_project FROM public.projects WHERE id = v_po.project_id;
    SELECT * INTO v_loc FROM public.studio_locations WHERE id = p_location_id;
    -- The PO's studio: projects.studio_id, else any studio the project owner
    -- holds an active non-guest seat in.
    v_ours := FOUND AND CASE
      WHEN v_project.studio_id IS NOT NULL THEN v_loc.organization_id = v_project.studio_id
      ELSE EXISTS (
        SELECT 1 FROM public.organization_members
        WHERE organization_id = v_loc.organization_id
          AND user_id = v_project.designer_id
          AND status = 'active'
          AND role <> 'guest'
      )
    END;
    IF NOT COALESCE(v_ours, false) OR NOT public.is_active_org_member(v_loc.organization_id) THEN
      RAISE EXCEPTION 'set_purchase_order_ship_to_location: location % is not a location of this purchase order''s studio', p_location_id
        USING ERRCODE = 'check_violation';
    END IF;
    IF v_loc.archived_at IS NOT NULL THEN
      RAISE EXCEPTION 'set_purchase_order_ship_to_location: location % is archived', p_location_id
        USING ERRCODE = 'check_violation';
    END IF;

    v_snapshot := NULLIF(concat_ws(E'\n',
      v_loc.label,
      NULLIF(btrim(v_loc.address ->> 'street'), ''),
      NULLIF(concat_ws(' ',
        NULLIF(concat_ws(', ',
          NULLIF(btrim(v_loc.address ->> 'city'), ''),
          NULLIF(btrim(v_loc.address ->> 'state'), '')
        ), ''),
        NULLIF(btrim(v_loc.address ->> 'zip'), '')
      ), '')
    ), '');
  END IF;

  PERFORM set_config('app.ffe_mutation_rpc', 'on', true);
  UPDATE public.purchase_orders
     SET ship_to_location_id = p_location_id,
         ship_to = v_snapshot
   WHERE id = p_po_id
  RETURNING * INTO v_po;
  RETURN v_po;
END;
$$;

-- ─── (a) record_vendor_payment refuses a refunded row ───────────────────────
-- The 00695 body, plus the refunded check after the row-level lane guard.

CREATE OR REPLACE FUNCTION public.record_vendor_payment(p_po_id uuid, p_request jsonb)
RETURNS public.vendor_payments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_uid       uuid := auth.uid();
  v_req       jsonb := COALESCE(p_request, '{}'::jsonb);
  v_allowed   text[] := ARRAY['poPaymentId', 'amountCents', 'paidOn', 'method', 'paymentMethodId',
                              'reference', 'receiptDocumentPath', 'currencyCode'];
  v_utc_day   date := (now() AT TIME ZONE 'UTC')::date;
  v_po        public.purchase_orders%ROWTYPE;
  v_studio    uuid;
  v_sched     public.po_payments%ROWTYPE;
  v_sched_id  uuid;
  v_amount    numeric;
  v_paid      bigint;
  v_paid_on   date;
  v_pm        public.studio_payment_methods%ROWTYPE;
  v_pm_id     uuid;
  v_method    text;
  v_row       public.vendor_payments%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'record_vendor_payment: not authenticated'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF jsonb_typeof(v_req) <> 'object' THEN
    RAISE EXCEPTION 'record_vendor_payment: request must be a JSON object'
      USING ERRCODE = 'check_violation';
  END IF;
  IF (v_req - v_allowed) <> '{}'::jsonb THEN
    RAISE EXCEPTION 'record_vendor_payment: unknown keys %',
      (SELECT string_agg(k, ', ') FROM jsonb_object_keys(v_req - v_allowed) k)
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_po FROM public.purchase_orders WHERE id = p_po_id FOR UPDATE;
  IF NOT FOUND OR NOT public.can_send_purchase_order(p_po_id) THEN
    RAISE EXCEPTION 'record_vendor_payment: purchase order % not found or access denied', p_po_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Lane guard, PO level.
  IF v_po.is_patina_catalog THEN
    RAISE EXCEPTION 'record_vendor_payment: purchase order % is on the Patina catalog lane; it settles through Stripe only', p_po_id
      USING ERRCODE = 'check_violation';
  END IF;

  v_sched_id := NULLIF(v_req->>'poPaymentId', '')::uuid;
  IF v_sched_id IS NOT NULL THEN
    SELECT * INTO v_sched FROM public.po_payments
     WHERE id = v_sched_id AND purchase_order_id = p_po_id
       FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'record_vendor_payment: payment row % is not on purchase order %', v_sched_id, p_po_id
        USING ERRCODE = 'check_violation';
    END IF;
    -- Lane guard, row level.
    IF v_sched.stripe_checkout_session_id IS NOT NULL OR v_sched.stripe_payment_intent_id IS NOT NULL THEN
      RAISE EXCEPTION 'record_vendor_payment: payment row % is on the Stripe rail; it settles through Stripe only', v_sched_id
        USING ERRCODE = 'check_violation';
    END IF;
    -- 00716: a refunded row takes no further payment.
    IF v_sched.state = 'refunded' THEN
      RAISE EXCEPTION 'record_vendor_payment: payment row % is already refunded', v_sched_id
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF v_req ? 'amountCents' THEN
    IF jsonb_typeof(v_req->'amountCents') <> 'number' THEN
      RAISE EXCEPTION 'record_vendor_payment: amountCents must be a number of cents'
        USING ERRCODE = 'check_violation';
    END IF;
    v_amount := (v_req->>'amountCents')::numeric;
    IF v_amount <= 0 OR v_amount <> trunc(v_amount) OR v_amount > 2147483647 THEN
      RAISE EXCEPTION 'record_vendor_payment: amountCents must be a positive whole number of cents'
        USING ERRCODE = 'check_violation';
    END IF;
  ELSIF v_sched_id IS NOT NULL THEN
    SELECT COALESCE(sum(amount_cents), 0) INTO v_paid
      FROM public.vendor_payments
     WHERE po_payment_id = v_sched_id AND voided_at IS NULL;
    v_amount := v_sched.amount_cents - v_paid;
    IF v_amount <= 0 THEN
      RAISE EXCEPTION 'record_vendor_payment: payment row % is already paid in full; pass amountCents to record more', v_sched_id
        USING ERRCODE = 'check_violation';
    END IF;
  ELSE
    RAISE EXCEPTION 'record_vendor_payment: amountCents is required for a payment not tied to a scheduled row'
      USING ERRCODE = 'check_violation';
  END IF;

  v_paid_on := COALESCE(NULLIF(v_req->>'paidOn', '')::date, v_utc_day);
  IF v_paid_on > v_utc_day + 1 THEN
    RAISE EXCEPTION 'record_vendor_payment: paidOn % is in the future', v_paid_on
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT studio_id INTO v_studio FROM public.projects WHERE id = v_po.project_id;

  v_pm_id := NULLIF(v_req->>'paymentMethodId', '')::uuid;
  IF v_pm_id IS NOT NULL THEN
    SELECT * INTO v_pm FROM public.studio_payment_methods WHERE id = v_pm_id;
    IF NOT FOUND OR NOT public.is_active_org_member(v_pm.organization_id) THEN
      RAISE EXCEPTION 'record_vendor_payment: payment method % not found or access denied', v_pm_id
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF v_pm.archived_at IS NOT NULL THEN
      RAISE EXCEPTION 'record_vendor_payment: payment method % is archived', v_pm_id
        USING ERRCODE = 'check_violation';
    END IF;
    IF v_studio IS NOT NULL AND v_pm.organization_id <> v_studio THEN
      RAISE EXCEPTION 'record_vendor_payment: payment method % belongs to another studio', v_pm_id
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  v_method := COALESCE(NULLIF(btrim(v_req->>'method'), ''), v_pm.kind, 'other');
  IF v_method NOT IN ('card', 'ach', 'check', 'wire', 'cash', 'other') THEN
    RAISE EXCEPTION 'record_vendor_payment: method must be one of card, ach, check, wire, cash, other'
      USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO public.vendor_payments (
    organization_id, purchase_order_id, po_payment_id, paid_on, amount_cents,
    currency_code, method, payment_method_id, reference, receipt_document_path, recorded_by
  )
  VALUES (
    COALESCE(v_studio, v_pm.organization_id), p_po_id, v_sched_id, v_paid_on, v_amount::integer,
    upper(COALESCE(NULLIF(btrim(v_req->>'currencyCode'), ''), 'USD')), v_method, v_pm_id,
    NULLIF(btrim(v_req->>'reference'), ''), NULLIF(btrim(v_req->>'receiptDocumentPath'), ''), v_uid
  )
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;
