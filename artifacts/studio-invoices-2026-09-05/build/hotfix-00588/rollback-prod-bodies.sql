-- ROLLBACK for migration 00588 — prod (Strata bkvcixdmuyejfzcijpdg) bodies as of 2026-09-10 03:15 UTC,
-- captured BEFORE `supabase db push` of 00588. These are 00574's definitions verbatim.
-- To roll back: run this whole file against Strata. Both are CREATE OR REPLACE, so owner,
-- SECURITY DEFINER, search_path and the service_role-only ACL are preserved. Note this
-- restores the bug 00588 fixed (studio invoices naming an unrelated designer-roster lead).

CREATE OR REPLACE FUNCTION public.resolve_invoice_link(p_token text, p_record_view boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_link           invoice_links%ROWTYPE;
  v_invoice        invoices%ROWTYPE;
  v_project_name   text;
  v_project_client uuid;
  v_payer          uuid;
  v_studio_name    text;
  v_studio_logo    text;
  v_studio_site    text;
  v_studio_source  text;
  v_studio_id      uuid;
  v_studio_location text;
  v_designer_name  text;
  v_client_name    text;
  v_bps            integer;
  v_remit          text;
  v_lines          jsonb;
  v_payments       jsonb;
  v_processing     boolean;
  v_requires_refund boolean;
  v_in_flight      boolean;
  v_dead           boolean;
  v_kind           text;
BEGIN
  IF p_token IS NULL OR p_token !~ '^[0-9a-f]{64}$' THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_link FROM invoice_links WHERE token = p_token;
  IF NOT FOUND OR v_link.status = 'revoked' THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_invoice FROM invoices WHERE id = v_link.invoice_id;
  IF NOT FOUND OR v_invoice.status = 'draft' THEN
    RETURN NULL;
  END IF;

  v_dead := v_link.status = 'closed' OR v_invoice.status = 'void';
  IF NOT v_dead AND v_invoice.status NOT IN ('sent','partially_paid','paid') THEN
    RETURN NULL;
  END IF;

  IF p_record_view THEN
    UPDATE invoice_links
    SET view_count = view_count + 1, last_viewed_at = now()
    WHERE id = v_link.id;
  END IF;

  -- Studio-first letterhead: the invoice's own studio, then the project's,
  -- then the designer's primary — all three named (the two-studio fix).
  SELECT s.studio_id, s.name, s.logo_url, s.website, s.source
  INTO v_studio_id, v_studio_name, v_studio_logo, v_studio_site, v_studio_source
  FROM public.resolve_studio_identity(
    p_project_id  => v_invoice.project_id,
    p_designer_id => v_invoice.designer_id,
    p_studio_id   => v_invoice.studio_id
  ) AS s;

  -- "City, State" from the studio's address (organizations.address is the
  -- OrganizationAddress jsonb: street/city/state/zip/country). NULL when the
  -- studio has no address or the letterhead is not a studio org.
  IF v_studio_id IS NOT NULL THEN
    SELECT nullif(concat_ws(', ',
             nullif(btrim(o.address->>'city'), ''),
             nullif(btrim(o.address->>'state'), '')), '')
    INTO v_studio_location
    FROM organizations o WHERE o.id = v_studio_id;
  END IF;

  SELECT coalesce(
           nullif(btrim(pr.full_name), ''),
           nullif(btrim(pr.display_name), ''),
           nullif(btrim(pr.business_name), '')
         )
  INTO v_designer_name
  FROM profiles pr WHERE pr.id = v_invoice.designer_id;

  IF v_dead THEN
    -- J13: the same PaymentIntent rule payments[]/pay.processing apply at
    -- :1245 (F3). A pending row with no stamped PI is a claim nobody paid —
    -- an abandoned Checkout, not money in flight — and without this the
    -- withdrawn sheet would read "settling" forever behind one such row.
    v_in_flight := EXISTS (
      SELECT 1 FROM invoice_payments
      WHERE invoice_id = v_invoice.id
        AND method = 'stripe'
        AND (
          (status = 'pending' AND stripe_payment_intent_id IS NOT NULL)
          OR status = 'requires_refund'
        )
    );
    v_kind := CASE WHEN v_in_flight THEN 'settling' ELSE 'withdrawn' END;
    RETURN jsonb_build_object(
      'kind', v_kind,
      'sheet', v_kind,
      'invoice', jsonb_build_object(
        'number', v_invoice.invoice_number,
        'title', v_invoice.title
      ),
      'studio', jsonb_build_object(
        'name', v_studio_name, 'logo_url', v_studio_logo,
        'website', v_studio_site, 'source', v_studio_source,
        'location', v_studio_location
      ),
      'designer_display_name', v_designer_name,
      'contact', jsonb_build_object(
        'designer_display_name', v_designer_name,
        'studio_name', v_studio_name,
        'website', v_studio_site
      )
    );
  END IF;

  SELECT p.name, p.client_id INTO v_project_name, v_project_client
  FROM projects p WHERE p.id = v_invoice.project_id;
  v_payer := coalesce(v_invoice.client_id, v_project_client);

  IF v_payer IS NOT NULL THEN
    SELECT coalesce(nullif(btrim(pr.full_name), ''), nullif(btrim(pr.display_name), ''))
    INTO v_client_name
    FROM profiles pr WHERE pr.id = v_payer;
  END IF;
  IF v_client_name IS NULL THEN
    -- A rostered household with no profile: the name resolves only when the
    -- roster holds exactly one email-only row for this designer (M5's
    -- implementable form — designer_clients has no project_id to key on).
    SELECT min(dc.client_name) INTO v_client_name
    FROM designer_clients dc
    WHERE dc.designer_id = v_invoice.designer_id
      AND dc.client_id IS NULL
      AND nullif(btrim(dc.client_name), '') IS NOT NULL
    HAVING count(*) = 1;
  END IF;

  -- attribution: the maker / vendor a furnishings line came through — an
  -- explicit text on the line's metadata, else the FF&E item's vendor_name,
  -- else the vendor record's name. A name only: anything shaped like an id or
  -- an address is dropped rather than printed.
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'description', li.description,
           'quantity', li.quantity,
           'unit_amount_cents', li.unit_amount_cents,
           'amount_cents', li.amount_cents,
           'kind', li.kind,
           'attribution', (
             SELECT CASE
               WHEN a.name IS NULL THEN NULL
               WHEN a.name ~ '@' THEN NULL
               WHEN a.name ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN NULL
               ELSE a.name
             END
             FROM (SELECT coalesce(
                     nullif(btrim(li.metadata->>'attribution'), ''),
                     nullif(btrim(li.metadata->>'vendor_name'), ''),
                     nullif(btrim(f.vendor_name), ''),
                     nullif(btrim(v.name), '')
                   ) AS name) a
           )
         ) ORDER BY li.sort_order, li.created_at, li.id), '[]'::jsonb)
  INTO v_lines
  FROM invoice_line_items li
  LEFT JOIN project_ffe_items f ON f.id = li.ffe_item_id
  LEFT JOIN vendors v ON v.id = f.vendor_id
  WHERE li.invoice_id = v_invoice.id;

  -- Review F3: a pending row exists from the moment of claim — before any
  -- Stripe session, and for up to 24h after an abandoned card Checkout. Only a
  -- row with a stamped PaymentIntent is money in flight (an ACH debit
  -- initiated; 00428's sync trigger moves the attempt to processing on that
  -- stamp), so only those pending rows are listed or count as processing.
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'amount_cents', p.amount_cents,
           'surcharge_cents', coalesce(p.surcharge_cents, 0),
           'method', p.method,
           'status', p.status,
           'rail', p.stripe_payment_method_type,
           'received_at', p.received_at
         ) ORDER BY coalesce(p.received_at, p.created_at), p.id), '[]'::jsonb),
         coalesce(bool_or(p.status = 'pending'), false),
         coalesce(bool_or(p.status = 'requires_refund'), false)
  INTO v_payments, v_processing, v_requires_refund
  FROM invoice_payments p
  WHERE p.invoice_id = v_invoice.id
    AND p.status <> 'failed'
    AND NOT (p.status = 'pending' AND p.stripe_payment_intent_id IS NULL);

  SELECT sbs.card_surcharge_bps, sbs.check_remit_to INTO v_bps, v_remit
  FROM studio_billing_settings sbs
  WHERE sbs.studio_id = v_invoice.studio_id;

  RETURN jsonb_build_object(
    'kind', 'invoice',
    'sheet', 'invoice',
    'invoice', jsonb_build_object(
      'number', v_invoice.invoice_number,
      'title', v_invoice.title,
      'status', v_invoice.status,
      'issue_date', v_invoice.issue_date,
      'due_date', v_invoice.due_date,
      'paid_at', v_invoice.paid_at,
      'currency', coalesce(v_invoice.currency, 'USD'),
      'subtotal_cents', v_invoice.subtotal_cents,
      'tax_cents', v_invoice.tax_cents,
      'tax_rate', v_invoice.tax_rate,
      'total_cents', v_invoice.total_cents,
      'amount_paid_cents', v_invoice.amount_paid_cents,
      'balance_cents', greatest(v_invoice.total_cents - v_invoice.amount_paid_cents, 0),
      'memo', v_invoice.memo,
      'project_name', v_project_name,
      'is_studio_invoice', v_invoice.project_id IS NULL
    ),
    'line_items', v_lines,
    'payments', v_payments,
    'studio', jsonb_build_object(
      'name', v_studio_name, 'logo_url', v_studio_logo,
      'website', v_studio_site, 'source', v_studio_source,
      'location', v_studio_location
    ),
    'designer_display_name', v_designer_name,
    'client_display_name', v_client_name,
    'payment_options', jsonb_build_object(
      -- ALWAYS the coalesced integer (G5): 300 is the rate the platform will
      -- charge, and most studios have no settings row.
      'card_surcharge_bps', coalesce(v_bps, 300),
      'check_remit_to', v_remit
    ),
    'pay', jsonb_build_object(
      'rails', jsonb_build_array('us_bank_account', 'card', 'check'),
      'processing', v_processing,
      -- J2: a requires_refund row is money that arrived and does NOT match the
      -- invoice — an overpayment or a gross mismatch, which only the studio can
      -- settle with Stripe. The balance reads as owing again while it stands,
      -- so re-offering Pay on top of it invites a second wrong payment and a
      -- second refund. The till closes until the row is resolved; the sheet
      -- says so in words rather than showing a dead button.
      'payable', NOT v_requires_refund
    )
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.resolve_invoice_link_for_checkout(p_token text)
 RETURNS TABLE(invoice_id uuid, link_id uuid, payer_id uuid, link_stripe_customer_id text, balance_cents integer, currency text, card_surcharge_bps integer, client_display_name text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT i.id,
         l.id,
         coalesce(i.client_id, p.client_id),
         l.stripe_customer_id,
         (i.total_cents - i.amount_paid_cents)::integer,
         lower(coalesce(i.currency, 'USD')),
         coalesce(s.card_surcharge_bps, 300),
         coalesce(
           nullif(btrim(pr.full_name), ''),
           nullif(btrim(pr.display_name), ''),
           (SELECT min(dc.client_name)
            FROM public.designer_clients dc
            WHERE dc.designer_id = i.designer_id
              AND dc.client_id IS NULL
              AND nullif(btrim(dc.client_name), '') IS NOT NULL
            HAVING count(*) = 1)
         )
  FROM public.invoice_links l
  JOIN public.invoices i ON i.id = l.invoice_id
  LEFT JOIN public.projects p ON p.id = i.project_id
  LEFT JOIN public.studio_billing_settings s ON s.studio_id = i.studio_id
  LEFT JOIN public.profiles pr ON pr.id = coalesce(i.client_id, p.client_id)
  WHERE p_token IS NOT NULL
    AND p_token ~ '^[0-9a-f]{64}$'
    AND l.token = p_token
    AND l.status = 'active'
    AND i.status IN ('sent','partially_paid')
    AND i.total_cents - i.amount_paid_cents > 0;
$function$;
