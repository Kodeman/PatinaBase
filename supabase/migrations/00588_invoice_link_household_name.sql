-- ═══════════════════════════════════════════════════════════════════════════
-- 00588 — The pay page names the invoice's own payer, not the designer roster
-- Lineage: resolve_invoice_link            00574 → 00588
--          resolve_invoice_link_for_checkout 00574 → 00588
-- Reconciles: nothing reverted — 00574 is the only prior body of either fn.
--
-- Prod symptom (Middle West Studio, 2026-09): EVERY studio invoice
-- (invoices.project_id IS NULL) rendered "for Jodi Kurhn and Terri Kalscheur"
-- at client.patina.cloud/pay/<token> — an unrelated email-only lead. A studio
-- invoice always has a payer (invoices.client_id) whose household sits on the
-- roster with client_name NULL and only client_email set, so the profile-name
-- lookup came back NULL and execution fell through to 00574's designer-wide
-- fallback. That fallback is keyed on invoices.designer_id and explicitly on
-- designer_clients.client_id IS NULL — it can never describe a payer who
-- exists, so it named whichever single email-only row the designer's roster
-- happened to hold. It is therefore gated here to the payer-less case
-- (a project invoice whose project carries no client) and is unreachable
-- whenever a payer exists. Both resolvers keep the F14 contract: the page and
-- the Stripe customer are named by the same derivation, in the same order.
--
-- CREATE OR REPLACE (never DROP/CREATE): the ACL posture on both functions is
-- pinned by supabase/tests/billing/invoice_links_test.sql and
-- supabase/tests/edge_api/platform_acl_compatibility_test.sql. REPLACE keeps
-- the existing owner and privileges, so 00574's REVOKE/GRANT pair stands
-- unchanged and no grant is re-issued here.
-- ═══════════════════════════════════════════════════════════════════════════

-- The only guest read path. One jsonb, no uuids; the only PII it may carry is
-- client_display_name, which is a name, or — when the studio entered nothing
-- but an address for the household — that address (00588). VOLATILE
-- (it writes view_count). Dead-link semantics (S2): malformed, unknown,
-- revoked, draft → the same NULL. A closed link, or a void invoice, renders
-- the withdrawn sheet (K5) — or the settling sheet when a Stripe payment is
-- still pending / requires_refund (M10) — with letterhead, number, title and a
-- contact, and nothing to pay.
CREATE OR REPLACE FUNCTION public.resolve_invoice_link(
  p_token text,
  p_record_view boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
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
    -- 1. The payer's own profile.
    SELECT coalesce(nullif(btrim(pr.full_name), ''), nullif(btrim(pr.display_name), ''))
    INTO v_client_name
    FROM profiles pr WHERE pr.id = v_payer;

    -- 2. The payer's OWN roster row — keyed on the payer, not the designer.
    -- A payer can hold more than one row: 00331 re-scoped
    -- idx_designer_clients_unique_profile to WHERE client_id IS NOT NULL AND
    -- status <> 'lead', so the lead row a household was promoted from survives
    -- alongside the active one and is usually the OLDER of the two (00585:49).
    -- The active row wins; dc.id breaks the created_at tie a single
    -- transaction timestamp would otherwise leave undecided, so this function
    -- and resolve_invoice_link_for_checkout cannot diverge (F14). The value
    -- test sits in the WHERE, before the LIMIT: a blank-named row must not be
    -- picked and then discarded, hiding a sibling row that does carry a name.
    IF v_client_name IS NULL THEN
      SELECT nullif(btrim(dc.client_name), '')
      INTO v_client_name
      FROM designer_clients dc
      WHERE dc.designer_id = v_invoice.designer_id
        AND dc.client_id = v_payer
        AND nullif(btrim(dc.client_name), '') IS NOT NULL
      ORDER BY (dc.status <> 'lead') DESC, dc.created_at, dc.id
      LIMIT 1;
    END IF;

    -- 3. The household email. A studio names a household by the address it
    -- entered and nothing else; printing that address is the studio's ask,
    -- and it beats printing a stranger's name or an unaddressed sheet.
    IF v_client_name IS NULL THEN
      SELECT nullif(btrim(dc.client_email), '')
      INTO v_client_name
      FROM designer_clients dc
      WHERE dc.designer_id = v_invoice.designer_id
        AND dc.client_id = v_payer
        AND nullif(btrim(dc.client_email), '') IS NOT NULL
      ORDER BY (dc.status <> 'lead') DESC, dc.created_at, dc.id
      LIMIT 1;
    END IF;
    IF v_client_name IS NULL THEN
      SELECT nullif(btrim(pr.email), '')
      INTO v_client_name
      FROM profiles pr WHERE pr.id = v_payer;
    END IF;
  ELSE
    -- 4. No payer at all (a project invoice whose project carries no client).
    -- A rostered household with no profile: the name resolves only when the
    -- roster holds exactly one email-only row for this designer (M5's
    -- implementable form — designer_clients has no project_id to key on).
    -- Gated to this branch: keyed on the designer, it cannot describe a payer.
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
$$;

COMMENT ON FUNCTION public.resolve_invoice_link(text, boolean) IS
  'The only guest read path for /pay/<token>. Called through the client portal''s service client (service_role only holds EXECUTE; authenticated and anon never — J33). Validates the 64-hex token, bumps view_count when p_record_view, and returns one narrow jsonb discriminated by kind (sheet is an alias for now): invoice (the payable sheet — no uuids, no internal notes, no Stripe ids, no token; the one address it may print is client_display_name, which since 00588 falls through to the payer household''s own email when the studio entered no name for them; studio.location is the studio address''s City, State; line_items[].attribution is the FF&E maker name), withdrawn (closed link / void invoice, K5), settling (closed with a PaymentIntent-stamped pending or a requires_refund payment, M10), or NULL for malformed/unknown/revoked/draft. pay.processing and payments[] count only PaymentIntent-stamped pending rows (F3); payments[] also carries requires_refund/refunded rows, which the sheet labels honestly, and pay.payable is false while a requires_refund row stands (J2).';

-- Ids only, for invoice-link-checkout. Rows only when the link is active, the
-- invoice is sent/partially_paid and the balance is positive.
CREATE OR REPLACE FUNCTION public.resolve_invoice_link_for_checkout(p_token text)
RETURNS TABLE (
  invoice_id uuid,
  link_id uuid,
  payer_id uuid,
  link_stripe_customer_id text,
  balance_cents integer,
  currency text,
  card_surcharge_bps integer,
  -- Review F14: the name the link Stripe customer is given — the same
  -- derivation resolve_invoice_link uses, in the same order. With a payer:
  -- the household profile's name, else that payer's own roster row's name,
  -- else the address the studio entered for them. Payer-less: the designer's
  -- single email-only roster row.
  client_display_name text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT i.id,
         l.id,
         coalesce(i.client_id, p.client_id),
         l.stripe_customer_id,
         (i.total_cents - i.amount_paid_cents)::integer,
         lower(coalesce(i.currency, 'USD')),
         coalesce(s.card_surcharge_bps, 300),
         CASE WHEN coalesce(i.client_id, p.client_id) IS NOT NULL THEN
           coalesce(
             nullif(btrim(pr.full_name), ''),
             nullif(btrim(pr.display_name), ''),
             -- Same row choice as resolve_invoice_link, term for term (F14):
             -- the active row beats the lead row 00331 lets coexist with it,
             -- dc.id breaks the created_at tie, and the value test sits in the
             -- WHERE so a blank row cannot hide a sibling that carries a name.
             (SELECT nullif(btrim(dc.client_name), '')
              FROM public.designer_clients dc
              WHERE dc.designer_id = i.designer_id
                AND dc.client_id = coalesce(i.client_id, p.client_id)
                AND nullif(btrim(dc.client_name), '') IS NOT NULL
              ORDER BY (dc.status <> 'lead') DESC, dc.created_at, dc.id
              LIMIT 1),
             (SELECT nullif(btrim(dc.client_email), '')
              FROM public.designer_clients dc
              WHERE dc.designer_id = i.designer_id
                AND dc.client_id = coalesce(i.client_id, p.client_id)
                AND nullif(btrim(dc.client_email), '') IS NOT NULL
              ORDER BY (dc.status <> 'lead') DESC, dc.created_at, dc.id
              LIMIT 1),
             nullif(btrim(pr.email), '')
           )
         ELSE
           (SELECT min(dc.client_name)
            FROM public.designer_clients dc
            WHERE dc.designer_id = i.designer_id
              AND dc.client_id IS NULL
              AND nullif(btrim(dc.client_name), '') IS NOT NULL
            HAVING count(*) = 1)
         END
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
$$;

COMMENT ON FUNCTION public.resolve_invoice_link_for_checkout(text) IS
  'Service-only: the ids invoice-link-checkout needs to open a Checkout for a link — invoice, link, the household payer if one exists (coalesce(invoices.client_id, projects.client_id); informational only — the guest rail always pays as the link, F5), the link''s own Stripe customer, the balance, the always-coalesced card bps, and the payer''s display name (00588: profile name → that payer''s own roster row''s name → the address the studio entered for them; the designer-wide email-only roster fallback applies only when there is no payer). Empty unless active + payable.';
