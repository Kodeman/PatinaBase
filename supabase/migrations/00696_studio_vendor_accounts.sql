-- ═══════════════════════════════════════════════════════════════════════════
-- 00696 — Studio vendor accounts: the studio's own card over the shared
--         vendors row (C-12; R1, R-PB4, R-PB9)
-- ═══════════════════════════════════════════════════════════════════════════
-- US-16 Phase 1 (SQ-402). d2 §1 C4 and §M1, direction §7 C-12, rulings R1,
-- R-PB4 and R-PB9.
--
-- `vendors` is global: any authenticated user may insert one, only
-- super_admin/quality_control may update (00058:22-41). The studio's account
-- with a vendor (account number, rep, terms, windows) had nowhere to live:
-- designer_vendor_accounts (00009:59-77) is per designer, read by nothing,
-- and useUpdateVendorPaymentTerms wrote terms onto the GLOBAL row, where a
-- designer's update matched zero rows and, had it worked, would have leaked
-- one studio's terms to every studio (d2 C4).
--
-- ── WHAT THIS ADDS ──────────────────────────────────────────────────────────
-- studio_vendor_accounts  one row per (studio, vendor), d2 §M1 data. It is
--                         the studio's account, so it outlives any designer.
--                         Read: active non-guest members of organization_id
--                         (is_active_studio_member, the studio_contacts
--                         predicate, 00417). Writes: upsert RPC only.
--   trade_discount_pct    R1 is ruled: margin is visible to the whole studio
--                         by default and an owner/admin may restrict it
--                         (00713). The column is NOT granted to
--                         authenticated; it is read through
--                         get_studio_vendor_accounts, which returns it only
--                         when can_see_studio_margin(org) (00713), and only
--                         such a caller may write it.
--   claim windows         NULL means the R-PB9 default: claims_window_days 3
--                         (72 h for the vendor) and inspection_window_days
--                         {"concealed_carrier": 5}. Clock code reads the
--                         effective values through
--                         studio_vendor_claim_windows(org, vendor).
--
-- ── RPCs (SECURITY DEFINER, pinned search_path, PUBLIC/anon revoked) ───────
--   upsert_studio_vendor_account(p_org, p_vendor_id, p_request)
--       patch semantics; stamps updated_by = auth.uid().
--   get_studio_vendor_accounts(p_org, p_vendor_id DEFAULT NULL)
--       the read path; masks trade_discount_pct per the margin rule.
--   resolve_or_create_vendor(p_name, p_website)        (R-PB4)
--       website host first, then exact name, before minting a global row.
--       Port of _board_deck_import_resolve_vendor (00676:251-301, host-exact
--       and race-safe since 00678:703-760), reusing 00678's
--       _board_deck_import_url_host.
--   studio_vendor_claim_windows(p_org, p_vendor_id)    SQL, SECURITY INVOKER.
--
-- Function bodies that gate trade_discount_pct call can_see_studio_margin,
-- which 00713 creates. They are plpgsql, so the name resolves when called;
-- 00696 and 00713 ship in the same Phase 1 push.
--
-- ── BACKFILL ────────────────────────────────────────────────────────────────
-- designer_vendor_accounts folds into the designer's studio. Counted before
-- writing this (2026-10-06): 0 rows on Strata, 0 locally, so the INSERT is
-- expected to be a no-op. The table is parked, not dropped.
-- Not here: copying vendors.default_payment_terms onto a studio row on its
-- first order (d2 §M1) belongs with the create_purchase_order / Assistant
-- prefill change, not this migration.
--
-- Adds GRANT/REVOKE → supabase/seed/00-legacy-grants.sql regenerated.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. studio_vendor_accounts ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.studio_vendor_accounts (
  id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id         uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  -- RESTRICT, like purchase_orders.vendor_id: deleting a shared vendors row
  -- must not silently take a studio's account record with it.
  vendor_id               uuid        NOT NULL REFERENCES public.vendors(id) ON DELETE RESTRICT,
  -- The company card in the studio rolodex.
  studio_contact_id       uuid        REFERENCES public.studio_contacts(id) ON DELETE SET NULL,

  -- Account
  account_status          account_status NOT NULL DEFAULT 'none',
  account_number          text,
  account_opened_on       date,
  tier_label              text,
  -- A person card in the studio rolodex.
  rep_contact_id          uuid        REFERENCES public.studio_contacts(id) ON DELETE SET NULL,
  credit_limit_cents      integer,

  -- Terms
  payment_pattern         purchase_order_payment_pattern,
  deposit_pct             numeric(5,2),
  net_days                integer,
  trade_discount_pct      numeric(5,2),

  -- How the studio pays them (00695)
  payment_method_id       uuid        REFERENCES public.studio_payment_methods(id) ON DELETE SET NULL,

  -- Ordering
  transmission            text,
  orders_email_override   text,
  portal_url              text,
  lead_time_days          integer,
  quote_validity_days     integer,

  -- Windows (vendor_profiles shape, 00350:44-62). NULL claims/inspection
  -- windows read as the R-PB9 defaults (studio_vendor_claim_windows).
  change_window_days      integer,
  claims_window_days      integer,
  inspection_window_days  jsonb,
  restocking_pct          numeric(5,2),

  -- Freight
  freight_policy          text,
  blind_ship              boolean     NOT NULL DEFAULT false,

  -- Resale certificate (the date only; a vault is a parked side journey)
  resale_cert_on_file_on  date,
  resale_cert_state       text,

  -- Bookkeeping
  notes                   text,
  archived_at             timestamptz,
  created_by              uuid,
  updated_by              uuid,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT studio_vendor_accounts_org_vendor_key UNIQUE (organization_id, vendor_id),
  CONSTRAINT studio_vendor_accounts_credit_limit_ck
    CHECK (credit_limit_cents IS NULL OR credit_limit_cents >= 0),
  CONSTRAINT studio_vendor_accounts_pct_ck
    CHECK ((deposit_pct IS NULL OR deposit_pct BETWEEN 0 AND 100)
       AND (trade_discount_pct IS NULL OR trade_discount_pct BETWEEN 0 AND 100)
       AND (restocking_pct IS NULL OR restocking_pct BETWEEN 0 AND 100)),
  CONSTRAINT studio_vendor_accounts_days_ck
    CHECK ((net_days IS NULL OR net_days BETWEEN 0 AND 365)
       AND (lead_time_days IS NULL OR lead_time_days BETWEEN 0 AND 3650)
       AND (quote_validity_days IS NULL OR quote_validity_days BETWEEN 0 AND 3650)
       AND (change_window_days IS NULL OR change_window_days BETWEEN 0 AND 3650)
       AND (claims_window_days IS NULL OR claims_window_days BETWEEN 0 AND 365)),
  CONSTRAINT studio_vendor_accounts_transmission_ck
    CHECK (transmission IS NULL OR transmission IN ('email', 'portal', 'phone', 'showroom')),
  CONSTRAINT studio_vendor_accounts_orders_email_ck
    CHECK (orders_email_override IS NULL OR orders_email_override ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  CONSTRAINT studio_vendor_accounts_resale_state_ck
    CHECK (resale_cert_state IS NULL OR resale_cert_state ~ '^[A-Z]{2}$'),
  -- {parcel, ltl, white_glove, concealed_carrier}: whole days, 0–365.
  CONSTRAINT studio_vendor_accounts_inspection_windows_ck
    CHECK (inspection_window_days IS NULL OR (
      jsonb_typeof(inspection_window_days) = 'object'
      AND (inspection_window_days - ARRAY['parcel', 'ltl', 'white_glove', 'concealed_carrier']) = '{}'::jsonb
      AND NOT jsonb_path_exists(
        inspection_window_days,
        '$.* ? (@.type() != "number" || @ < 0 || @ > 365 || @ != @.floor())'
      )
    ))
);

CREATE INDEX IF NOT EXISTS idx_studio_vendor_accounts_vendor
  ON public.studio_vendor_accounts (vendor_id);

DROP TRIGGER IF EXISTS set_updated_at_studio_vendor_accounts ON public.studio_vendor_accounts;
CREATE TRIGGER set_updated_at_studio_vendor_accounts
  BEFORE UPDATE ON public.studio_vendor_accounts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

COMMENT ON TABLE public.studio_vendor_accounts IS
  'A studio''s account with a vendor (00696, C-12): account #, rep, terms, windows, ordering and '
  'freight facts, one row per (organization, vendor) over the shared vendors row (R-PB4). Read '
  'by active non-guest members; trade_discount_pct only through get_studio_vendor_accounts, '
  'gated by can_see_studio_margin (R1). Written only through upsert_studio_vendor_account.';
COMMENT ON COLUMN public.studio_vendor_accounts.trade_discount_pct IS
  'The studio''s trade discount with this vendor, percent. Not granted to authenticated: read '
  'through get_studio_vendor_accounts, which returns it only when can_see_studio_margin(org) '
  '(R1, 00713). Only such a caller may write it.';
COMMENT ON COLUMN public.studio_vendor_accounts.claims_window_days IS
  'Days after delivery to file a vendor claim. NULL = the R-PB9 default of 3 (72 hours); read '
  'the effective value through studio_vendor_claim_windows(org, vendor).';
COMMENT ON COLUMN public.studio_vendor_accounts.inspection_window_days IS
  'Inspection windows in days by mode: {parcel, ltl, white_glove, concealed_carrier}. Missing '
  'concealed_carrier = the R-PB9 default of 5; read the effective value through '
  'studio_vendor_claim_windows(org, vendor).';

ALTER TABLE public.studio_vendor_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS studio_vendor_accounts_member_select ON public.studio_vendor_accounts;
CREATE POLICY studio_vendor_accounts_member_select ON public.studio_vendor_accounts
  FOR SELECT TO authenticated
  USING (public.is_active_studio_member(organization_id));

-- Every column but trade_discount_pct. A revoke names authenticated too:
-- Strata predates the 2026-05-30 default flip and seed/00-legacy-grants.sql
-- re-applies the blanket baseline locally (00417:265-274).
REVOKE ALL ON TABLE public.studio_vendor_accounts FROM PUBLIC, anon, authenticated;
GRANT SELECT (
  id, organization_id, vendor_id, studio_contact_id,
  account_status, account_number, account_opened_on, tier_label, rep_contact_id, credit_limit_cents,
  payment_pattern, deposit_pct, net_days, payment_method_id,
  transmission, orders_email_override, portal_url, lead_time_days, quote_validity_days,
  change_window_days, claims_window_days, inspection_window_days, restocking_pct,
  freight_policy, blind_ship, resale_cert_on_file_on, resale_cert_state,
  notes, archived_at, created_by, updated_by, created_at, updated_at
) ON public.studio_vendor_accounts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.studio_vendor_accounts TO service_role;

-- ─── 2. studio_vendor_claim_windows ─────────────────────────────────────────
-- The effective claim windows for a studio and vendor: the account's own
-- values where set, else the R-PB9 defaults. An account's inspection keys
-- win; concealed_carrier falls back to 5 when it sets none. SECURITY INVOKER:
-- a member sees their studio's account through RLS, anyone else gets the
-- defaults, and the clock cron (postgres) sees every account.

CREATE OR REPLACE FUNCTION public.studio_vendor_claim_windows(p_org uuid, p_vendor_id uuid)
RETURNS TABLE (claims_window_days integer, inspection_window_days jsonb)
LANGUAGE sql
STABLE
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT COALESCE(account.claims_window_days, 3),
         '{"concealed_carrier": 5}'::jsonb || COALESCE(account.inspection_window_days, '{}'::jsonb)
  FROM (SELECT 1) AS one
  LEFT JOIN public.studio_vendor_accounts AS account
    ON account.organization_id = p_org
   AND account.vendor_id = p_vendor_id;
$$;

COMMENT ON FUNCTION public.studio_vendor_claim_windows(uuid, uuid) IS
  'Effective claim windows for (studio, vendor): claims_window_days defaults to 3 (72 h) and '
  'inspection_window_days.concealed_carrier to 5 when the account sets none (R-PB9, 00696).';

REVOKE ALL ON FUNCTION public.studio_vendor_claim_windows(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.studio_vendor_claim_windows(uuid, uuid) TO authenticated, service_role;

-- ─── 3. get_studio_vendor_accounts ──────────────────────────────────────────
-- The studio's accounts (one vendor when p_vendor_id is given), archived rows
-- included. trade_discount_pct is NULL unless can_see_studio_margin(p_org).
-- A caller who is not an active non-guest member gets no rows, as RLS would.

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
  IF auth.uid() IS NULL OR NOT public.is_active_studio_member(p_org) THEN
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

COMMENT ON FUNCTION public.get_studio_vendor_accounts(uuid, uuid) IS
  'A studio''s vendor accounts (00696), optionally one vendor. trade_discount_pct is returned '
  'only when can_see_studio_margin(p_org) (R1, 00713); otherwise NULL. Non-members get no rows.';

REVOKE ALL ON FUNCTION public.get_studio_vendor_accounts(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_studio_vendor_accounts(uuid, uuid) TO authenticated;

-- ─── 4. upsert_studio_vendor_account ────────────────────────────────────────
-- p_request (camelCase, every key optional; a present key sets the column,
-- JSON null clears it): studioContactId, accountStatus, accountNumber,
-- accountOpenedOn, tierLabel, repContactId, creditLimitCents, paymentPattern,
-- depositPct, netDays, tradeDiscountPct, paymentMethodId, transmission,
-- ordersEmailOverride, portalUrl, leadTimeDays, quoteValidityDays,
-- changeWindowDays, claimsWindowDays, inspectionWindowDays, restockingPct,
-- freightPolicy, blindShip, resaleCertOnFileOn, resaleCertState, notes,
-- archived (true archives, false restores). Creates the row on first call.

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
  IF p_org IS NULL OR NOT public.is_active_studio_member(p_org) THEN
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

COMMENT ON FUNCTION public.upsert_studio_vendor_account(uuid, uuid, jsonb) IS
  'Create or patch the studio''s account with a vendor (00696, C-12). Active non-guest members '
  'of p_org only; updated_by = auth.uid(). tradeDiscountPct needs can_see_studio_margin (R1). '
  'Rolodex links must be this studio''s cards (company for studioContactId, person for '
  'repContactId); paymentMethodId a live method of this studio.';

REVOKE ALL ON FUNCTION public.upsert_studio_vendor_account(uuid, uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.upsert_studio_vendor_account(uuid, uuid, jsonb) TO authenticated;

-- ─── 5. resolve_or_create_vendor (R-PB4) ────────────────────────────────────
-- 1. a vendor whose website host equals the given host (lowercased, www.
--    dropped; scheme optional), oldest first; 2. exact case-insensitive name,
--    oldest first; 3. insert a global row named name → host, website
--    https://<host>, converging with a concurrent insert of the same website
--    (idx_vendors_website_lower, 00156). Text in the website field that is
--    not a host ("call Joe") is ignored rather than minted.

CREATE OR REPLACE FUNCTION public.resolve_or_create_vendor(p_name text, p_website text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_name   text := NULLIF(btrim(p_name), '');
  v_domain text := public._board_deck_import_url_host(p_website);
  v_id     uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'resolve_or_create_vendor: not authenticated'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_domain IS NOT NULL
     AND v_domain !~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$' THEN
    v_domain := NULL;
  END IF;
  IF v_name IS NULL AND v_domain IS NULL THEN
    RAISE EXCEPTION 'resolve_or_create_vendor: a vendor name or website is required'
      USING ERRCODE = 'check_violation';
  END IF;
  IF length(v_name) > 200 THEN
    RAISE EXCEPTION 'resolve_or_create_vendor: a vendor name is at most 200 characters'
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_domain IS NOT NULL THEN
    SELECT vendor.id INTO v_id
    FROM public.vendors AS vendor
    WHERE public._board_deck_import_url_host(vendor.website) = v_domain
    ORDER BY vendor.created_at ASC NULLS LAST, vendor.id
    LIMIT 1;
    IF v_id IS NOT NULL THEN
      RETURN v_id;
    END IF;
  END IF;

  IF v_name IS NOT NULL THEN
    SELECT vendor.id INTO v_id
    FROM public.vendors AS vendor
    WHERE lower(vendor.name) = lower(v_name)
    ORDER BY vendor.created_at ASC NULLS LAST, vendor.id
    LIMIT 1;
    IF v_id IS NOT NULL THEN
      RETURN v_id;
    END IF;
  END IF;

  INSERT INTO public.vendors (name, website)
  VALUES (
    COALESCE(v_name, v_domain),
    CASE WHEN v_domain IS NOT NULL THEN 'https://' || v_domain END
  )
  ON CONFLICT ((lower(website))) WHERE website IS NOT NULL DO NOTHING
  RETURNING id INTO v_id;
  IF v_id IS NULL THEN
    SELECT vendor.id INTO v_id
    FROM public.vendors AS vendor
    WHERE lower(vendor.website) = lower('https://' || v_domain);
  END IF;
  RETURN v_id;
END;
$$;

COMMENT ON FUNCTION public.resolve_or_create_vendor(text, text) IS
  'R-PB4 (00696): resolve a shared vendors row by website host, then exact name, before '
  'inserting one, so studios share rows instead of minting duplicates. Port of '
  '_board_deck_import_resolve_vendor (00676 → 00678). Returns the vendor id.';

REVOKE ALL ON FUNCTION public.resolve_or_create_vendor(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_or_create_vendor(text, text) TO authenticated;

-- ─── 6. Backfill: designer_vendor_accounts → the designer's studio ─────────
-- 0 rows on Strata and locally when counted (2026-10-06). Each row goes to
-- the designer's active non-guest design studio (an owned studio first, then
-- the earliest joined); where two designers in one studio both hold an
-- account with a vendor, the most recently updated wins. Rep fields have no
-- card to point at, so they are kept in notes.

INSERT INTO public.studio_vendor_accounts (
  organization_id, vendor_id, account_status, account_number, account_opened_on,
  tier_label, notes, created_by, updated_by, created_at
)
SELECT DISTINCT ON (studio.organization_id, dva.vendor_id)
  studio.organization_id,
  dva.vendor_id,
  dva.account_status,
  NULLIF(btrim(dva.account_number), ''),
  dva.account_since::date,
  tier.tier_name,
  NULLIF(concat_ws(E'\n',
    NULLIF(btrim(dva.notes), ''),
    CASE WHEN COALESCE(dva.sales_rep_name, dva.sales_rep_email, dva.sales_rep_phone) IS NOT NULL
         THEN 'Rep: ' || concat_ws(' · ', dva.sales_rep_name, dva.sales_rep_email, dva.sales_rep_phone)
    END
  ), ''),
  dva.designer_id,
  dva.designer_id,
  COALESCE(dva.created_at, now())
FROM public.designer_vendor_accounts AS dva
JOIN LATERAL (
  SELECT membership.organization_id
  FROM public.organization_members AS membership
  JOIN public.organizations AS org ON org.id = membership.organization_id
  WHERE membership.user_id = dva.designer_id
    AND membership.status = 'active'
    AND membership.role <> 'guest'
    AND org.type = 'design_studio'
  ORDER BY (membership.role = 'owner') DESC, membership.joined_at ASC NULLS LAST, membership.id
  LIMIT 1
) AS studio ON true
LEFT JOIN public.vendor_trade_programs AS tier ON tier.id = dva.current_tier_id
ORDER BY studio.organization_id, dva.vendor_id, dva.updated_at DESC NULLS LAST, dva.id
ON CONFLICT (organization_id, vendor_id) DO NOTHING;

COMMENT ON TABLE public.designer_vendor_accounts IS
  'PARKED (00696). Per-designer vendor accounts from 00009, never read by an app. Superseded by '
  'studio_vendor_accounts, into which its rows were folded (0 rows on Strata at the time).';
