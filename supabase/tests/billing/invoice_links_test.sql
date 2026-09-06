-- The Invoice, Standing Alone — invoice links + the guest checkout rail (00574)
-- Run after a fresh reset:
--   psql 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' \
--     -v ON_ERROR_STOP=1 -f supabase/tests/billing/invoice_links_test.sql
--
-- Covers: the mint trigger on issue_invoice and on a draft→partially_paid
-- jump (no duplicate on the refund walk back to sent); the M12 exception
-- swallow; the backfill statement's coverage and idempotency; the resolver's
-- payable payload for a project invoice, a payer-less project invoice and a
-- studio invoice with no house (two-studio letterhead); the forbidden-key
-- walk; dead-link semantics (malformed / unknown / revoked / draft → NULL);
-- the K5 withdrawn sheet and the M10 settling sheet; view counting; the
-- discriminated-union CHECK; the M3 actor_changed supersede in BOTH claim
-- RPCs; the M4 link identity term on finalize/recover; M8; the M11
-- Regenerate refusal for all three live states; the M10 void refusal on
-- processing and the link closing on void; the sweep; S5/S6 authority on
-- regenerate/get_invoice_link; and the ACL posture (anon holds EXECUTE on
-- none of the new functions, the table is unreadable by browser roles).

BEGIN;

SET LOCAL statement_timeout = '60s';

-- ── Fixtures ──────────────────────────────────────────────────────────────

INSERT INTO auth.users (
  id, email, encrypted_password, email_confirmed_at, created_at, updated_at,
  instance_id, aud, role
)
VALUES
  ('a5740000-0000-4000-8000-000000000001', 'links-owner@test.invalid', '', now(), now(), now(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('a5740000-0000-4000-8000-000000000002', 'links-peer@test.invalid', '', now(), now(), now(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('a5740000-0000-4000-8000-000000000003', 'links-contractor@test.invalid', '', now(), now(), now(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('a5740000-0000-4000-8000-000000000004', 'links-client@test.invalid', '', now(), now(), now(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('a5740000-0000-4000-8000-000000000005', 'links-stranger@test.invalid', '', now(), now(), now(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('a5740000-0000-4000-8000-000000000006', 'links-guest-member@test.invalid', '', now(), now(), now(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

INSERT INTO public.profiles (
  id, email, full_name, is_designer, stripe_customer_id, created_at, updated_at
)
VALUES
  ('a5740000-0000-4000-8000-000000000001', 'links-owner@test.invalid', 'Links Owner', true, 'cus_links_owner', now(), now()),
  ('a5740000-0000-4000-8000-000000000002', 'links-peer@test.invalid', 'Links Peer', true, NULL, now(), now()),
  ('a5740000-0000-4000-8000-000000000003', 'links-contractor@test.invalid', 'Links Contractor', false, NULL, now(), now()),
  ('a5740000-0000-4000-8000-000000000004', 'links-client@test.invalid', 'Links Client', false, 'cus_links_client', now(), now()),
  ('a5740000-0000-4000-8000-000000000005', 'links-stranger@test.invalid', 'Links Stranger', false, NULL, now(), now()),
  ('a5740000-0000-4000-8000-000000000006', 'links-guest-member@test.invalid', 'Links Guest Member', false, NULL, now(), now())
ON CONFLICT (id) DO UPDATE
SET stripe_customer_id = excluded.stripe_customer_id,
    full_name = excluded.full_name,
    is_designer = excluded.is_designer;

-- Studio One is the owner's primary studio (with a design peer and a guest
-- member); Studio Two is the owner's second studio — the two-studio
-- letterhead case; the contractor org is shared with a contractor.
INSERT INTO public.organizations (id, type, name, slug)
VALUES
  ('a5741000-0000-4000-8000-000000000001', 'design_studio', 'Links Studio One', 'links-studio-one'),
  ('a5741000-0000-4000-8000-000000000002', 'design_studio', 'Links Studio Two', 'links-studio-two'),
  ('a5741000-0000-4000-8000-000000000003', 'contractor', 'Links Contractor Co', 'links-contractor-co');

INSERT INTO public.organization_members (
  id, user_id, organization_id, role, status, joined_at
)
VALUES
  ('a5742000-0000-4000-8000-000000000001', 'a5740000-0000-4000-8000-000000000001',
   'a5741000-0000-4000-8000-000000000001', 'owner', 'active', now()),
  ('a5742000-0000-4000-8000-000000000002', 'a5740000-0000-4000-8000-000000000002',
   'a5741000-0000-4000-8000-000000000001', 'member', 'active', now()),
  ('a5742000-0000-4000-8000-000000000003', 'a5740000-0000-4000-8000-000000000006',
   'a5741000-0000-4000-8000-000000000001', 'guest', 'active', now()),
  ('a5742000-0000-4000-8000-000000000004', 'a5740000-0000-4000-8000-000000000001',
   'a5741000-0000-4000-8000-000000000002', 'owner', 'active', now()),
  ('a5742000-0000-4000-8000-000000000005', 'a5740000-0000-4000-8000-000000000001',
   'a5741000-0000-4000-8000-000000000003', 'member', 'active', now()),
  ('a5742000-0000-4000-8000-000000000006', 'a5740000-0000-4000-8000-000000000003',
   'a5741000-0000-4000-8000-000000000003', 'member', 'active', now());

INSERT INTO public.user_roles (user_id, role_id, granted_by)
SELECT 'a5740000-0000-4000-8000-000000000001', role.id,
       'a5740000-0000-4000-8000-000000000001'
FROM public.roles AS role WHERE role.name = 'studio_owner';

-- The household sits on the owner's roster with a profile; a second,
-- email-only row (no profile) is the payer-less population — exactly one such
-- row, so the resolver's name fallback may use it.
INSERT INTO public.designer_clients (id, designer_id, client_id, client_email, client_name, status)
VALUES
  ('a5743000-0000-4000-8000-000000000001', 'a5740000-0000-4000-8000-000000000001',
   'a5740000-0000-4000-8000-000000000004', NULL, NULL, 'active'),
  ('a5743000-0000-4000-8000-000000000002', 'a5740000-0000-4000-8000-000000000001',
   NULL, 'harper-links@test.invalid', 'Harper Guest', 'active');

INSERT INTO public.projects (
  id, name, designer_id, client_id, created_by, status, studio_id
)
VALUES
  ('a5744000-0000-4000-8000-000000000001', 'Links Project',
   'a5740000-0000-4000-8000-000000000001', 'a5740000-0000-4000-8000-000000000004',
   'a5740000-0000-4000-8000-000000000001', 'active', 'a5741000-0000-4000-8000-000000000001'),
  ('a5744000-0000-4000-8000-000000000002', 'Payerless Project',
   'a5740000-0000-4000-8000-000000000001', NULL,
   'a5740000-0000-4000-8000-000000000001', 'active', 'a5741000-0000-4000-8000-000000000001');

-- Studio Two carries billing settings; Studio One deliberately has none (the
-- majority case — the payload must still say 300).
INSERT INTO public.studio_billing_settings (studio_id, card_surcharge_bps, check_remit_to)
VALUES ('a5741000-0000-4000-8000-000000000002', 150, 'PO Box 7, Somewhere');

-- Every fixture invoice starts as a draft; the trigger fires on the UPDATE.
--   31 project invoice, household payer      (issued via issue_invoice)
--   32 project invoice, NO payer             (payer-less rail)
--   33 studio invoice, no house, Studio Two  (two-studio letterhead)
--   34 draft, stays draft
--   35 void with a claimed attempt           (withdrawn)
--   36 void with a session, then a late charge (settling)
--   37 M3: guest → household supersedes
--   38 M3: household → guest supersedes
--   39 M11 / M10 processing
--   40 M10 void with session_created
--   41 M4 finalize/recover link identity + M8
--   42 draft → partially_paid jump, refund walk
--   43 M12 exception swallow
--   45 paid
--   46 sweep + regenerate + fresh claim under the new link
INSERT INTO public.invoices (
  id, project_id, designer_id, client_id, studio_id, title, status, currency,
  subtotal_cents, total_cents, amount_paid_cents, memo, internal_notes
)
VALUES
  ('a5745000-0000-4000-8000-000000000031', 'a5744000-0000-4000-8000-000000000001',
   'a5740000-0000-4000-8000-000000000001', 'a5740000-0000-4000-8000-000000000004',
   'a5741000-0000-4000-8000-000000000001', NULL, 'draft', 'USD', 10000, 10000, 0,
   'Thank you.', 'SECRET internal note'),
  ('a5745000-0000-4000-8000-000000000032', 'a5744000-0000-4000-8000-000000000002',
   'a5740000-0000-4000-8000-000000000001', NULL,
   'a5741000-0000-4000-8000-000000000001', NULL, 'draft', 'USD', 10000, 10000, 0, NULL, NULL),
  ('a5745000-0000-4000-8000-000000000033', NULL,
   'a5740000-0000-4000-8000-000000000001', 'a5740000-0000-4000-8000-000000000004',
   'a5741000-0000-4000-8000-000000000002', 'Consultation, September', 'draft', 'USD',
   20000, 20000, 0, NULL, NULL),
  ('a5745000-0000-4000-8000-000000000034', 'a5744000-0000-4000-8000-000000000001',
   'a5740000-0000-4000-8000-000000000001', 'a5740000-0000-4000-8000-000000000004',
   'a5741000-0000-4000-8000-000000000001', NULL, 'draft', 'USD', 5000, 5000, 0, NULL, NULL),
  ('a5745000-0000-4000-8000-000000000035', 'a5744000-0000-4000-8000-000000000001',
   'a5740000-0000-4000-8000-000000000001', 'a5740000-0000-4000-8000-000000000004',
   'a5741000-0000-4000-8000-000000000001', NULL, 'draft', 'USD', 10000, 10000, 0, NULL, NULL),
  ('a5745000-0000-4000-8000-000000000036', 'a5744000-0000-4000-8000-000000000001',
   'a5740000-0000-4000-8000-000000000001', 'a5740000-0000-4000-8000-000000000004',
   'a5741000-0000-4000-8000-000000000001', NULL, 'draft', 'USD', 10000, 10000, 0, NULL, NULL),
  ('a5745000-0000-4000-8000-000000000037', 'a5744000-0000-4000-8000-000000000001',
   'a5740000-0000-4000-8000-000000000001', 'a5740000-0000-4000-8000-000000000004',
   'a5741000-0000-4000-8000-000000000001', NULL, 'draft', 'USD', 10000, 10000, 0, NULL, NULL),
  ('a5745000-0000-4000-8000-000000000038', 'a5744000-0000-4000-8000-000000000001',
   'a5740000-0000-4000-8000-000000000001', 'a5740000-0000-4000-8000-000000000004',
   'a5741000-0000-4000-8000-000000000001', NULL, 'draft', 'USD', 10000, 10000, 0, NULL, NULL),
  ('a5745000-0000-4000-8000-000000000039', 'a5744000-0000-4000-8000-000000000001',
   'a5740000-0000-4000-8000-000000000001', 'a5740000-0000-4000-8000-000000000004',
   'a5741000-0000-4000-8000-000000000001', NULL, 'draft', 'USD', 10000, 10000, 0, NULL, NULL),
  ('a5745000-0000-4000-8000-000000000040', 'a5744000-0000-4000-8000-000000000001',
   'a5740000-0000-4000-8000-000000000001', 'a5740000-0000-4000-8000-000000000004',
   'a5741000-0000-4000-8000-000000000001', NULL, 'draft', 'USD', 10000, 10000, 0, NULL, NULL),
  ('a5745000-0000-4000-8000-000000000041', 'a5744000-0000-4000-8000-000000000002',
   'a5740000-0000-4000-8000-000000000001', NULL,
   'a5741000-0000-4000-8000-000000000001', NULL, 'draft', 'USD', 10000, 10000, 0, NULL, NULL),
  ('a5745000-0000-4000-8000-000000000042', 'a5744000-0000-4000-8000-000000000001',
   'a5740000-0000-4000-8000-000000000001', 'a5740000-0000-4000-8000-000000000004',
   'a5741000-0000-4000-8000-000000000001', NULL, 'draft', 'USD', 10000, 10000, 0, NULL, NULL),
  ('a5745000-0000-4000-8000-000000000043', 'a5744000-0000-4000-8000-000000000001',
   'a5740000-0000-4000-8000-000000000001', 'a5740000-0000-4000-8000-000000000004',
   'a5741000-0000-4000-8000-000000000001', NULL, 'draft', 'USD', 10000, 10000, 0, NULL, NULL),
  ('a5745000-0000-4000-8000-000000000045', 'a5744000-0000-4000-8000-000000000001',
   'a5740000-0000-4000-8000-000000000001', 'a5740000-0000-4000-8000-000000000004',
   'a5741000-0000-4000-8000-000000000001', NULL, 'draft', 'USD', 10000, 10000, 0, NULL, NULL),
  ('a5745000-0000-4000-8000-000000000046', 'a5744000-0000-4000-8000-000000000002',
   'a5740000-0000-4000-8000-000000000001', NULL,
   'a5741000-0000-4000-8000-000000000001', NULL, 'draft', 'USD', 10000, 10000, 0, NULL, NULL);

INSERT INTO public.invoice_line_items (invoice_id, kind, description, quantity, unit_amount_cents, amount_cents, sort_order)
SELECT i.id, 'adhoc', 'Line one', 1, 5000, 5000, 0
FROM public.invoices i WHERE i.id::text LIKE 'a5745000-%'
UNION ALL
SELECT i.id, 'adhoc', 'Line two', 1, i.total_cents - 5000, i.total_cents - 5000, 1
FROM public.invoices i WHERE i.id::text LIKE 'a5745000-%';

CREATE OR REPLACE FUNCTION pg_temp.assume_links_actor(p_actor uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', p_actor, 'role', 'authenticated')::text,
    true
  );
END;
$$;
GRANT EXECUTE ON FUNCTION pg_temp.assume_links_actor(uuid) TO PUBLIC;

-- Every key at every depth of a jsonb document.
CREATE OR REPLACE FUNCTION pg_temp.jsonb_deep_keys(p jsonb)
RETURNS SETOF text
LANGUAGE sql
AS $$
  WITH RECURSIVE walk(node) AS (
    SELECT p
    UNION ALL
    SELECT child.value
    FROM walk
    CROSS JOIN LATERAL (
      SELECT value FROM jsonb_each(
        CASE WHEN jsonb_typeof(walk.node) = 'object' THEN walk.node ELSE '{}'::jsonb END)
      UNION ALL
      SELECT value FROM jsonb_array_elements(
        CASE WHEN jsonb_typeof(walk.node) = 'array' THEN walk.node ELSE '[]'::jsonb END)
    ) AS child(value)
  )
  SELECT k.key
  FROM walk
  CROSS JOIN LATERAL jsonb_each(
    CASE WHEN jsonb_typeof(walk.node) = 'object' THEN walk.node ELSE '{}'::jsonb END
  ) AS k(key, value);
$$;
GRANT EXECUTE ON FUNCTION pg_temp.jsonb_deep_keys(jsonb) TO PUBLIC;

-- Every string value at every depth of a jsonb document.
CREATE OR REPLACE FUNCTION pg_temp.jsonb_deep_strings(p jsonb)
RETURNS SETOF text
LANGUAGE sql
AS $$
  WITH RECURSIVE walk(node) AS (
    SELECT p
    UNION ALL
    SELECT child.value
    FROM walk
    CROSS JOIN LATERAL (
      SELECT value FROM jsonb_each(
        CASE WHEN jsonb_typeof(walk.node) = 'object' THEN walk.node ELSE '{}'::jsonb END)
      UNION ALL
      SELECT value FROM jsonb_array_elements(
        CASE WHEN jsonb_typeof(walk.node) = 'array' THEN walk.node ELSE '[]'::jsonb END)
    ) AS child(value)
  )
  SELECT walk.node #>> '{}'
  FROM walk
  WHERE jsonb_typeof(walk.node) = 'string';
$$;
GRANT EXECUTE ON FUNCTION pg_temp.jsonb_deep_strings(jsonb) TO PUBLIC;

CREATE TEMP TABLE links_state (label text PRIMARY KEY, value text NOT NULL);
GRANT ALL ON links_state TO PUBLIC;

-- ── The ACL posture: anon holds EXECUTE on none; the table is service-only ─
DO $$
DECLARE
  v_sig text;
  v_service_only text[] := ARRAY[
    'public.ensure_invoice_link(uuid)',
    'public.resolve_invoice_link_for_checkout(text)',
    'public.resolve_invoice_return_nonce(text)',
    'public.set_invoice_link_stripe_customer(uuid,text)',
    'public.set_invoice_link_payer_email(uuid,text)',
    'public.claim_invoice_link_checkout_attempt(uuid,uuid,text,text)',
    'public.claim_invoice_checkout_attempt(uuid,uuid,text,boolean,text)',
    'public.finalize_invoice_checkout_attempt(uuid,uuid,text,text,uuid)',
    'public.recover_invoice_checkout_session_evidence(uuid,uuid,text,text,uuid)',
    'public.expire_stale_invoice_checkout_attempts(interval)'
  ];
  v_browser text[] := ARRAY[
    'public.resolve_invoice_link(text,boolean)',
    'public.regenerate_invoice_link(uuid)',
    'public.get_invoice_link(uuid)'
  ];
BEGIN
  FOREACH v_sig IN ARRAY v_service_only || v_browser LOOP
    ASSERT NOT has_function_privilege('anon', v_sig, 'EXECUTE'),
      format('anon must not execute %s', v_sig);
    ASSERT has_function_privilege('service_role', v_sig, 'EXECUTE'),
      format('service_role must execute %s', v_sig);
  END LOOP;
  FOREACH v_sig IN ARRAY v_service_only LOOP
    ASSERT NOT has_function_privilege('authenticated', v_sig, 'EXECUTE'),
      format('authenticated must not execute service-only %s', v_sig);
  END LOOP;
  FOREACH v_sig IN ARRAY v_browser LOOP
    ASSERT has_function_privilege('authenticated', v_sig, 'EXECUTE'),
      format('authenticated must execute %s', v_sig);
  END LOOP;
  -- The trigger function and the legacy void body stay private to every role.
  FOREACH v_sig IN ARRAY ARRAY[
    'public.mint_invoice_link_on_issue()',
    'public._void_invoice_authorized_legacy_00397(uuid,text)'
  ] LOOP
    ASSERT NOT has_function_privilege('anon', v_sig, 'EXECUTE')
       AND NOT has_function_privilege('authenticated', v_sig, 'EXECUTE')
       AND NOT has_function_privilege('service_role', v_sig, 'EXECUTE'),
      format('%s must stay private', v_sig);
  END LOOP;
  -- The 4-argument finalize/recover forms are gone (no 42725 ambiguity).
  ASSERT to_regprocedure('public.finalize_invoice_checkout_attempt(uuid,uuid,text,text)') IS NULL,
    'the 4-arg finalize must be dropped';
  ASSERT to_regprocedure('public.recover_invoice_checkout_session_evidence(uuid,uuid,text,text)') IS NULL,
    'the 4-arg recover must be dropped';

  ASSERT NOT has_table_privilege('anon', 'public.invoice_links', 'SELECT')
     AND NOT has_table_privilege('authenticated', 'public.invoice_links', 'SELECT')
     AND has_table_privilege('service_role', 'public.invoice_links', 'SELECT'),
    'invoice_links must be readable by service_role only';
  ASSERT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.invoice_links'::regclass),
    'invoice_links must have RLS enabled';
  ASSERT NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'invoice_links'),
    'invoice_links must carry zero policies';
  ASSERT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'invoice-checkout-attempts-expire'),
    'the hourly sweep must be scheduled';
END;
$$;

-- ── Mint: issue_invoice (the real path) fires the trigger ──────────────────
SET LOCAL ROLE authenticated;
SELECT pg_temp.assume_links_actor('a5740000-0000-4000-8000-000000000001');
DO $$
BEGIN
  PERFORM public.issue_invoice('a5745000-0000-4000-8000-000000000031', NULL);
  ASSERT (SELECT status = 'sent' AND invoice_number ~ '^INV-' FROM public.invoices
          WHERE id = 'a5745000-0000-4000-8000-000000000031'),
    'issue_invoice must issue the fixture';
END;
$$;
RESET ROLE;

DO $$
DECLARE v_token text;
BEGIN
  SELECT token INTO v_token FROM public.invoice_links
  WHERE invoice_id = 'a5745000-0000-4000-8000-000000000031' AND status = 'active';
  ASSERT v_token ~ '^[0-9a-f]{64}$', 'issue_invoice must mint one active 64-hex link';
  ASSERT (SELECT count(*) = 1 FROM public.invoice_links
          WHERE invoice_id = 'a5745000-0000-4000-8000-000000000031'),
    'exactly one link per issue';
  ASSERT (SELECT created_by = 'a5740000-0000-4000-8000-000000000001'
          FROM public.invoice_links
          WHERE invoice_id = 'a5745000-0000-4000-8000-000000000031'),
    'the minted link is attributed to the designer';
  INSERT INTO links_state VALUES ('token31', v_token);
END;
$$;

-- The other fixtures issue through the same UPDATE the RPCs perform.
UPDATE public.invoices
SET status = 'sent', invoice_number = 'INV-L-' || right(id::text, 2),
    issue_date = current_date, due_date = current_date + 15, sent_at = now()
WHERE id IN (
  'a5745000-0000-4000-8000-000000000032', 'a5745000-0000-4000-8000-000000000033',
  'a5745000-0000-4000-8000-000000000035', 'a5745000-0000-4000-8000-000000000036',
  'a5745000-0000-4000-8000-000000000037', 'a5745000-0000-4000-8000-000000000038',
  'a5745000-0000-4000-8000-000000000039', 'a5745000-0000-4000-8000-000000000040',
  'a5745000-0000-4000-8000-000000000041', 'a5745000-0000-4000-8000-000000000045',
  'a5745000-0000-4000-8000-000000000046'
);

DO $$
BEGIN
  ASSERT (SELECT count(*) = 11 FROM public.invoice_links l
          WHERE l.status = 'active'
            AND l.invoice_id IN (SELECT id FROM public.invoices
                                 WHERE id::text LIKE 'a5745000-%' AND status = 'sent'
                                   AND id <> 'a5745000-0000-4000-8000-000000000031')),
    'every UPDATE to sent must mint exactly one active link';
  ASSERT NOT EXISTS (SELECT 1 FROM public.invoice_links
                     WHERE invoice_id = 'a5745000-0000-4000-8000-000000000034'),
    'a draft must have no link';
  INSERT INTO links_state
  SELECT 'token' || right(invoice_id::text, 2), token FROM public.invoice_links
  WHERE invoice_id::text LIKE 'a5745000-%'
    AND invoice_id <> 'a5745000-0000-4000-8000-000000000031';
END;
$$;

-- ── Mint: a draft → partially_paid jump mints; the refund walk back to sent
--    does not duplicate ───────────────────────────────────────────────────
UPDATE public.invoices
SET status = 'partially_paid', amount_paid_cents = 4000, invoice_number = 'INV-L-42',
    issue_date = current_date, sent_at = now()
WHERE id = 'a5745000-0000-4000-8000-000000000042';
UPDATE public.invoices SET status = 'sent', amount_paid_cents = 0
WHERE id = 'a5745000-0000-4000-8000-000000000042';
DO $$
BEGIN
  ASSERT (SELECT count(*) = 1 FROM public.invoice_links
          WHERE invoice_id = 'a5745000-0000-4000-8000-000000000042' AND status = 'active'),
    'partially_paid mints once; the walk back to sent must not mint a second link';
END;
$$;

-- ── M12: a failure inside the trigger never takes the status write down ──
ALTER TABLE public.invoice_links
  ADD CONSTRAINT tmp_links_block_00574 CHECK (false) NOT VALID;
UPDATE public.invoices
SET status = 'sent', invoice_number = 'INV-L-43', issue_date = current_date, sent_at = now()
WHERE id = 'a5745000-0000-4000-8000-000000000043';
ALTER TABLE public.invoice_links DROP CONSTRAINT tmp_links_block_00574;
DO $$
BEGIN
  ASSERT (SELECT status = 'sent' FROM public.invoices
          WHERE id = 'a5745000-0000-4000-8000-000000000043'),
    'M12: the invoice must still issue when the mint fails';
  ASSERT NOT EXISTS (SELECT 1 FROM public.invoice_links
                     WHERE invoice_id = 'a5745000-0000-4000-8000-000000000043'),
    'M12: the swallowed mint left no link';
END;
$$;

SET LOCAL ROLE service_role;
DO $$
DECLARE v_token text;
BEGIN
  v_token := public.ensure_invoice_link('a5745000-0000-4000-8000-000000000043');
  ASSERT v_token ~ '^[0-9a-f]{64}$', 'ensure_invoice_link recovers the missing link';
  ASSERT public.ensure_invoice_link('a5745000-0000-4000-8000-000000000043') = v_token,
    'ensure_invoice_link is stable';
  ASSERT public.ensure_invoice_link('a5745000-0000-4000-8000-000000000031')
         = (SELECT value FROM links_state WHERE label = 'token31'),
    'ensure_invoice_link returns the existing active token';
  ASSERT public.ensure_invoice_link('a5745000-0000-4000-8000-000000000034') IS NULL,
    'ensure_invoice_link is NULL for a draft';
  ASSERT public.ensure_invoice_link('00000000-0000-4000-8000-000000000000') IS NULL,
    'ensure_invoice_link is NULL for a missing invoice';
END;
$$;
RESET ROLE;

-- ── Backfill: the migration's statement covers sent/partially_paid/paid and
--    skips draft/void, idempotently ─────────────────────────────────────────
INSERT INTO public.invoices (
  id, project_id, designer_id, client_id, studio_id, status, currency,
  subtotal_cents, total_cents, amount_paid_cents, invoice_number, voided_at, void_reason,
  paid_at
)
VALUES
  ('a5745000-0000-4000-8000-000000000051', 'a5744000-0000-4000-8000-000000000001',
   'a5740000-0000-4000-8000-000000000001', 'a5740000-0000-4000-8000-000000000004',
   'a5741000-0000-4000-8000-000000000001', 'sent', 'USD', 1000, 1000, 0, 'INV-B-51', NULL, NULL, NULL),
  ('a5745000-0000-4000-8000-000000000052', 'a5744000-0000-4000-8000-000000000001',
   'a5740000-0000-4000-8000-000000000001', 'a5740000-0000-4000-8000-000000000004',
   'a5741000-0000-4000-8000-000000000001', 'partially_paid', 'USD', 1000, 1000, 500, 'INV-B-52', NULL, NULL, NULL),
  ('a5745000-0000-4000-8000-000000000053', 'a5744000-0000-4000-8000-000000000001',
   'a5740000-0000-4000-8000-000000000001', 'a5740000-0000-4000-8000-000000000004',
   'a5741000-0000-4000-8000-000000000001', 'paid', 'USD', 1000, 1000, 1000, 'INV-B-53', NULL, NULL, now()),
  ('a5745000-0000-4000-8000-000000000054', 'a5744000-0000-4000-8000-000000000001',
   'a5740000-0000-4000-8000-000000000001', 'a5740000-0000-4000-8000-000000000004',
   'a5741000-0000-4000-8000-000000000001', 'draft', 'USD', 1000, 1000, 0, NULL, NULL, NULL, NULL),
  ('a5745000-0000-4000-8000-000000000055', 'a5744000-0000-4000-8000-000000000001',
   'a5740000-0000-4000-8000-000000000001', 'a5740000-0000-4000-8000-000000000004',
   'a5741000-0000-4000-8000-000000000001', 'void', 'USD', 1000, 1000, 0, 'INV-B-55', now(), 'Test', NULL);

DO $$
DECLARE v_before int; v_after int; v_again int;
BEGIN
  ASSERT NOT EXISTS (SELECT 1 FROM public.invoice_links
                     WHERE invoice_id::text LIKE 'a5745000-0000-4000-8000-0000000000%'
                       AND invoice_id::text >= 'a5745000-0000-4000-8000-000000000051'),
    'a direct INSERT at an issued status does not fire the AFTER UPDATE trigger';

  -- The migration's backfill statement, verbatim.
  INSERT INTO public.invoice_links (invoice_id, token, created_by)
  SELECT i.id,
         encode(extensions.gen_random_bytes(32), 'hex'),
         (SELECT pr.id FROM public.profiles pr WHERE pr.id = i.designer_id)
  FROM public.invoices i
  WHERE i.status IN ('sent','partially_paid','paid')
  ON CONFLICT (invoice_id) WHERE status = 'active' DO NOTHING;
  SELECT count(*) INTO v_after FROM public.invoice_links;

  ASSERT (SELECT count(*) = 3 FROM public.invoice_links
          WHERE invoice_id IN ('a5745000-0000-4000-8000-000000000051',
                               'a5745000-0000-4000-8000-000000000052',
                               'a5745000-0000-4000-8000-000000000053')
            AND status = 'active'),
    'backfill must cover sent, partially_paid and paid';
  ASSERT NOT EXISTS (SELECT 1 FROM public.invoice_links
                     WHERE invoice_id IN ('a5745000-0000-4000-8000-000000000054',
                                          'a5745000-0000-4000-8000-000000000055')),
    'backfill must skip draft and void';

  INSERT INTO public.invoice_links (invoice_id, token, created_by)
  SELECT i.id,
         encode(extensions.gen_random_bytes(32), 'hex'),
         (SELECT pr.id FROM public.profiles pr WHERE pr.id = i.designer_id)
  FROM public.invoices i
  WHERE i.status IN ('sent','partially_paid','paid')
  ON CONFLICT (invoice_id) WHERE status = 'active' DO NOTHING;
  SELECT count(*) INTO v_again FROM public.invoice_links;
  ASSERT v_again = v_after, 'backfill must be idempotent';
END;
$$;

-- ── The discriminated union: exactly one of payer_id / invoice_link_id ────
DO $$
DECLARE v_error text;
BEGIN
  BEGIN
    INSERT INTO public.invoice_checkout_attempts (
      invoice_id, payer_id, invoice_link_id, stripe_customer_id, amount_cents, currency,
      stripe_idempotency_key
    ) VALUES (
      'a5745000-0000-4000-8000-000000000045', NULL, NULL, 'cus_x', 100, 'usd', 'xor-both-null'
    );
  EXCEPTION WHEN check_violation THEN v_error := sqlerrm; END;
  ASSERT v_error LIKE '%chk_invoice_attempt_actor%', 'both-null actor must violate the CHECK';

  v_error := NULL;
  BEGIN
    INSERT INTO public.invoice_checkout_attempts (
      invoice_id, payer_id, invoice_link_id, stripe_customer_id, amount_cents, currency,
      stripe_idempotency_key
    ) VALUES (
      'a5745000-0000-4000-8000-000000000045', 'a5740000-0000-4000-8000-000000000004',
      (SELECT id FROM public.invoice_links WHERE invoice_id = 'a5745000-0000-4000-8000-000000000045'),
      'cus_x', 100, 'usd', 'xor-both-set'
    );
  EXCEPTION WHEN check_violation THEN v_error := sqlerrm; END;
  ASSERT v_error LIKE '%chk_invoice_attempt_actor%', 'both-set actor must violate the CHECK';

  v_error := NULL;
  BEGIN
    INSERT INTO public.invoice_checkout_attempts (
      invoice_id, payer_id, stripe_customer_id, amount_cents, currency,
      stripe_idempotency_key, return_nonce
    ) VALUES (
      'a5745000-0000-4000-8000-000000000045', 'a5740000-0000-4000-8000-000000000004',
      'cus_x', 100, 'usd', 'nonce-shape', 'not-hex'
    );
  EXCEPTION WHEN check_violation THEN v_error := sqlerrm; END;
  ASSERT v_error LIKE '%chk_invoice_attempt_nonce%', 'a malformed nonce must violate the CHECK';
END;
$$;

-- Mark 45 paid so the read tests see a paid invoice.
UPDATE public.invoices SET status = 'paid', amount_paid_cents = 10000, paid_at = now()
WHERE id = 'a5745000-0000-4000-8000-000000000045';

-- ── The read path ─────────────────────────────────────────────────────────
SET LOCAL ROLE service_role;
DO $$
DECLARE
  v jsonb;
  v_token text;
  v_key text;
  v_str text;
BEGIN
  -- Dead links: one NULL, no oracle.
  ASSERT public.resolve_invoice_link(NULL) IS NULL, 'NULL token → NULL';
  ASSERT public.resolve_invoice_link('nope') IS NULL, 'malformed token → NULL';
  ASSERT public.resolve_invoice_link(repeat('0', 64)) IS NULL, 'unknown token → NULL';
  ASSERT public.resolve_invoice_link(upper((SELECT value FROM links_state WHERE label = 'token31'))) IS NULL,
    'the token is lowercase hex only';

  -- Project invoice with a household payer.
  v_token := (SELECT value FROM links_state WHERE label = 'token31');
  v := public.resolve_invoice_link(v_token);
  ASSERT v IS NOT NULL, 'an active link on a sent invoice resolves';
  ASSERT v->>'kind' = 'invoice' AND v->>'sheet' = 'invoice', 'payable sheet discriminator';
  ASSERT v->'invoice'->>'status' = 'sent'
     AND (v->'invoice'->>'total_cents')::int = 10000
     AND (v->'invoice'->>'amount_paid_cents')::int = 0
     AND (v->'invoice'->>'balance_cents')::int = 10000
     AND v->'invoice'->>'currency' = 'USD'
     AND v->'invoice'->>'number' ~ '^INV-'
     AND v->'invoice'->>'memo' = 'Thank you.'
     AND v->'invoice'->>'project_name' = 'Links Project'
     AND (v->'invoice'->>'is_studio_invoice')::boolean = false,
    format('project invoice header: %s', v->'invoice');
  ASSERT jsonb_array_length(v->'line_items') = 2
     AND v->'line_items'->0->>'description' = 'Line one'
     AND (v->'line_items'->0->>'amount_cents')::int = 5000,
    'line items are ordered and exact';
  ASSERT v->'studio'->>'name' = 'Links Studio One' AND v->'studio'->>'source' = 'studio',
    format('project letterhead is the project studio: %s', v->'studio');
  ASSERT v->>'designer_display_name' = 'Links Owner', 'designer name';
  ASSERT v->>'client_display_name' = 'Links Client', 'household name from the profile';
  ASSERT (v->'payment_options'->>'card_surcharge_bps')::int = 300
     AND v->'payment_options'->'check_remit_to' = 'null'::jsonb,
    'no settings row → 300 and a NULL remit-to (never a held state)';
  ASSERT v->'pay'->'rails' = '["us_bank_account","card","check"]'::jsonb
     AND (v->'pay'->>'processing')::boolean = false,
    'three rails, not processing';
  ASSERT v->'payments' = '[]'::jsonb, 'no payments yet';

  -- The forbidden-key walk: no uuid, no id, no PII, no Stripe id, no token.
  FOR v_key IN SELECT * FROM pg_temp.jsonb_deep_keys(v) LOOP
    ASSERT v_key <> 'id' AND v_key NOT LIKE '%\_id'
       AND v_key NOT IN ('internal_notes','email','payer_email','phone',
                         'stripe_customer_id','stripe_checkout_session_id',
                         'stripe_payment_intent_id','stripe_event_id',
                         'void_reason','voided_at','ar_flagged_at','ar_last_chased_at',
                         'last_reminder_at','reminder_count','token','return_nonce',
                         'reference','recorded_by','note'),
      format('forbidden key in payload: %s', v_key);
  END LOOP;
  FOR v_str IN SELECT * FROM pg_temp.jsonb_deep_strings(v) LOOP
    ASSERT v_str !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       AND v_str !~ '^[0-9a-f]{64}$'
       AND v_str NOT LIKE '%SECRET internal%'
       AND v_str NOT LIKE '%@test.invalid',
      format('forbidden value in payload: %s', v_str);
  END LOOP;

  -- View counting.
  ASSERT (SELECT view_count = 1 FROM public.invoice_links WHERE token = v_token),
    'the first resolve counted one view';
  PERFORM public.resolve_invoice_link(v_token, false);
  ASSERT (SELECT view_count = 1 FROM public.invoice_links WHERE token = v_token),
    'p_record_view=false leaves view_count alone';
  PERFORM public.resolve_invoice_link(v_token, true);
  ASSERT (SELECT view_count = 2 AND last_viewed_at IS NOT NULL
          FROM public.invoice_links WHERE token = v_token),
    'p_record_view=true bumps view_count';

  -- Payer-less project invoice: the roster's single email-only row names her.
  v := public.resolve_invoice_link((SELECT value FROM links_state WHERE label = 'token32'));
  ASSERT v->>'kind' = 'invoice' AND v->>'client_display_name' = 'Harper Guest',
    format('payer-less invoice resolves with the roster name: %s', v->>'client_display_name');

  -- Studio invoice with no house: the letterhead is the studio it names, not
  -- the designer's primary studio; its settings row is read.
  v := public.resolve_invoice_link((SELECT value FROM links_state WHERE label = 'token33'));
  ASSERT v->'studio'->>'name' = 'Links Studio Two',
    format('two-studio letterhead must be the invoice''s own studio: %s', v->'studio');
  ASSERT (v->'invoice'->>'is_studio_invoice')::boolean = true
     AND v->'invoice'->'project_name' = 'null'::jsonb
     AND v->'invoice'->>'title' = 'Consultation, September',
    'a studio invoice has no house and carries its title';
  ASSERT (v->'payment_options'->>'card_surcharge_bps')::int = 150
     AND v->'payment_options'->>'check_remit_to' = 'PO Box 7, Somewhere',
    'studio billing settings reach the payload';
  ASSERT (SELECT s.name = 'Links Studio Two'
          FROM public.resolve_studio_identity(
            p_project_id => NULL,
            p_designer_id => 'a5740000-0000-4000-8000-000000000001',
            p_studio_id => 'a5741000-0000-4000-8000-000000000002') s),
    'the payload agrees with resolve_studio_identity';

  -- Draft: no link exists, but even a hand-planted one is NULL.
  INSERT INTO public.invoice_links (invoice_id, token)
  VALUES ('a5745000-0000-4000-8000-000000000034', repeat('d', 64));
  ASSERT public.resolve_invoice_link(repeat('d', 64)) IS NULL, 'draft → NULL';
  DELETE FROM public.invoice_links WHERE token = repeat('d', 64);

  -- Paid: resolves (a receipt) with no balance; the checkout resolver is empty.
  v := public.resolve_invoice_link((SELECT value FROM links_state WHERE label = 'token45'));
  ASSERT v->'invoice'->>'status' = 'paid' AND (v->'invoice'->>'balance_cents')::int = 0,
    'a paid invoice resolves as a receipt';
  ASSERT NOT EXISTS (SELECT 1 FROM public.resolve_invoice_link_for_checkout(
                       (SELECT value FROM links_state WHERE label = 'token45'))),
    'nothing to check out on a paid invoice';

  -- The checkout resolver: ids only, coalesced bps, the household payer or NULL.
  ASSERT (SELECT r.invoice_id = 'a5745000-0000-4000-8000-000000000031'
                 AND r.payer_id = 'a5740000-0000-4000-8000-000000000004'
                 AND r.link_stripe_customer_id IS NULL
                 AND r.balance_cents = 10000
                 AND r.currency = 'usd'
                 AND r.card_surcharge_bps = 300
          FROM public.resolve_invoice_link_for_checkout(v_token) r),
    'checkout resolver returns the household payer';
  ASSERT (SELECT r.payer_id IS NULL AND r.balance_cents = 10000
          FROM public.resolve_invoice_link_for_checkout(
            (SELECT value FROM links_state WHERE label = 'token32')) r),
    'checkout resolver returns NULL payer for the payer-less invoice';
  ASSERT NOT EXISTS (SELECT 1 FROM public.resolve_invoice_link_for_checkout('garbage')),
    'checkout resolver is empty for a malformed token';
  ASSERT NOT EXISTS (SELECT 1 FROM public.resolve_invoice_link_for_checkout(repeat('0', 64))),
    'checkout resolver is empty for an unknown token';
END;
$$;
RESET ROLE;

-- anon cannot even call the resolver; authenticated can (the portal's
-- service client path mirrors resolve_plan_transmittal).
SET LOCAL ROLE anon;
DO $$
DECLARE v_error text;
BEGIN
  BEGIN
    PERFORM public.resolve_invoice_link((SELECT value FROM links_state WHERE label = 'token31'));
  EXCEPTION WHEN insufficient_privilege THEN v_error := sqlstate; END;
  ASSERT v_error = '42501', 'anon must be denied resolve_invoice_link';
  v_error := NULL;
  BEGIN
    PERFORM 1 FROM public.invoice_links;
  EXCEPTION WHEN insufficient_privilege THEN v_error := sqlstate; END;
  ASSERT v_error = '42501', 'anon must be denied the table';
END;
$$;
RESET ROLE;

-- ── S5 / S6: get_invoice_link and regenerate_invoice_link authority ───────
-- owner yes · design-studio co-member yes · household yes (read only) ·
-- contractor co-member no · guest member no · stranger no
DO $$
DECLARE
  v_actor uuid;
  v_error text;
  v jsonb;
  v_expect_read boolean;
  v_expect_regen boolean;
BEGIN
  FOR v_actor, v_expect_read, v_expect_regen IN
    SELECT * FROM (VALUES
      ('a5740000-0000-4000-8000-000000000001'::uuid, true,  true),   -- owner
      ('a5740000-0000-4000-8000-000000000002'::uuid, true,  true),   -- design peer
      ('a5740000-0000-4000-8000-000000000004'::uuid, true,  false),  -- household
      ('a5740000-0000-4000-8000-000000000003'::uuid, false, false),  -- contractor co-member
      ('a5740000-0000-4000-8000-000000000006'::uuid, false, false),  -- guest member
      ('a5740000-0000-4000-8000-000000000005'::uuid, false, false)   -- stranger
    ) AS t(actor, can_read, can_regen)
  LOOP
    SET LOCAL ROLE authenticated;
    PERFORM pg_temp.assume_links_actor(v_actor);

    v_error := NULL;
    BEGIN
      v := public.get_invoice_link('a5745000-0000-4000-8000-000000000031');
    EXCEPTION WHEN OTHERS THEN v_error := sqlerrm; END;
    IF v_expect_read THEN
      ASSERT v_error IS NULL
         AND v->>'token' = (SELECT value FROM links_state WHERE label = 'token31')
         AND v->>'status' = 'active',
        format('%s must read the link, got %L / %s', v_actor, v_error, v);
    ELSE
      ASSERT v_error = 'invoice_not_found',
        format('%s must not read the link, got %L', v_actor, v_error);
    END IF;

    -- Regenerate is probed on the paid invoice 45 so no fixture below is
    -- disturbed; a successful call is undone by reading the new token only.
    v_error := NULL;
    BEGIN
      PERFORM public.regenerate_invoice_link('a5745000-0000-4000-8000-000000000045');
    EXCEPTION WHEN OTHERS THEN v_error := sqlerrm; END;
    IF v_expect_regen THEN
      ASSERT v_error IS NULL, format('%s must regenerate, got %L', v_actor, v_error);
    ELSE
      ASSERT v_error = 'invoice_not_found',
        format('%s must not regenerate, got %L', v_actor, v_error);
    END IF;
    RESET ROLE;
  END LOOP;

  -- Two regenerations landed on 45: one active link, two revoked.
  ASSERT (SELECT count(*) FILTER (WHERE status = 'active') = 1
             AND count(*) FILTER (WHERE status = 'revoked') = 2
          FROM public.invoice_links
          WHERE invoice_id = 'a5745000-0000-4000-8000-000000000045'),
    'regenerate revokes the old link and mints one new one';
  ASSERT (SELECT bool_and(revoked_at IS NOT NULL) FROM public.invoice_links
          WHERE invoice_id = 'a5745000-0000-4000-8000-000000000045' AND status = 'revoked'),
    'a revoked link is stamped';

  -- The household never learns a draft exists; the owner reads NULL for it.
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.assume_links_actor('a5740000-0000-4000-8000-000000000004');
  v_error := NULL;
  BEGIN
    PERFORM public.get_invoice_link('a5745000-0000-4000-8000-000000000034');
  EXCEPTION WHEN OTHERS THEN v_error := sqlerrm; END;
  ASSERT v_error = 'invoice_not_found', 'the household must not see a draft';
  PERFORM pg_temp.assume_links_actor('a5740000-0000-4000-8000-000000000001');
  ASSERT public.get_invoice_link('a5745000-0000-4000-8000-000000000034') IS NULL,
    'a draft has no link to read';
  v_error := NULL;
  BEGIN
    PERFORM public.regenerate_invoice_link('a5745000-0000-4000-8000-000000000034');
  EXCEPTION WHEN OTHERS THEN v_error := sqlerrm; END;
  ASSERT v_error = 'invoice_link_not_payable', 'a draft cannot be regenerated';
  RESET ROLE;
END;
$$;

-- A revoked token is dead; the fresh one resolves.
SET LOCAL ROLE service_role;
DO $$
BEGIN
  ASSERT public.resolve_invoice_link((SELECT value FROM links_state WHERE label = 'token45')) IS NULL,
    'a revoked token → NULL';
  ASSERT public.resolve_invoice_link((SELECT token FROM public.invoice_links
    WHERE invoice_id = 'a5745000-0000-4000-8000-000000000045' AND status = 'active')) IS NOT NULL,
    'the regenerated token resolves';
END;
$$;

-- ── The link-payer Stripe customer: compare-and-set, canonical winner ─────
DO $$
DECLARE v_link uuid;
BEGIN
  SELECT id INTO v_link FROM public.invoice_links
  WHERE invoice_id = 'a5745000-0000-4000-8000-000000000032' AND status = 'active';
  ASSERT public.set_invoice_link_stripe_customer(v_link, 'cus_guest_32') = 'cus_guest_32',
    'first set wins';
  ASSERT public.set_invoice_link_stripe_customer(v_link, 'cus_guest_32_late') = 'cus_guest_32',
    'a racing second set returns the canonical winner';
  ASSERT public.set_invoice_link_stripe_customer('00000000-0000-4000-8000-000000000000', 'cus_x') IS NULL,
    'an unknown link returns NULL';
  PERFORM public.set_invoice_link_payer_email(v_link, '  payer-32@test.invalid ');
  ASSERT (SELECT payer_email = 'payer-32@test.invalid' FROM public.invoice_links WHERE id = v_link),
    'payer_email is captured, trimmed';
  PERFORM public.set_invoice_link_payer_email(v_link, '   ');
  ASSERT (SELECT payer_email = 'payer-32@test.invalid'
          FROM public.invoice_links WHERE id = v_link),
    'an empty write does not erase the address';
END;
$$;

-- ── The link claim: link identity, NULL payer, nonce, M8 ──────────────────
DO $$
DECLARE
  v_link uuid;
  v_claim jsonb;
  v_retry jsonb;
  v_error text;
  v_final jsonb;
BEGIN
  SELECT id INTO v_link FROM public.invoice_links
  WHERE invoice_id = 'a5745000-0000-4000-8000-000000000032' AND status = 'active';

  -- Identity failures collapse to the page's own errors.
  v_error := NULL;
  BEGIN
    PERFORM public.claim_invoice_link_checkout_attempt(
      'a5745000-0000-4000-8000-000000000032', v_link, 'cus_someone_else', 'card');
  EXCEPTION WHEN OTHERS THEN v_error := sqlerrm; END;
  ASSERT v_error = 'invoice_checkout_customer_mismatch',
    format('a foreign customer on the link must reject, got %L', v_error);

  v_error := NULL;
  BEGIN
    PERFORM public.claim_invoice_link_checkout_attempt(
      'a5745000-0000-4000-8000-000000000031', v_link, 'cus_guest_32', 'card');
  EXCEPTION WHEN OTHERS THEN v_error := sqlerrm; END;
  ASSERT v_error = 'invoice_not_found',
    format('a link on another invoice must reject, got %L', v_error);

  v_error := NULL;
  BEGIN
    PERFORM public.claim_invoice_link_checkout_attempt(
      'a5745000-0000-4000-8000-000000000032', v_link, 'cus_guest_32', 'paypal');
  EXCEPTION WHEN OTHERS THEN v_error := sqlerrm; END;
  ASSERT v_error LIKE 'invoice_checkout_bad_payment_method:%',
    format('an unknown rail must reject, got %L', v_error);

  v_claim := public.claim_invoice_link_checkout_attempt(
    'a5745000-0000-4000-8000-000000000032', v_link, 'cus_guest_32', 'card');
  ASSERT v_claim->'payer_id' = 'null'::jsonb
     AND (v_claim->>'invoice_link_id')::uuid = v_link
     AND v_claim->>'return_nonce' ~ '^[0-9a-f]{64}$'
     AND (v_claim->>'amount_cents')::int = 10000
     AND (v_claim->>'surcharge_cents')::int = 300
     AND v_claim->>'stripe_customer_id' = 'cus_guest_32'
     AND v_claim->>'state' = 'claimed',
    format('link claim shape: %s', v_claim);
  -- M8: the link payment is recorded by nobody, and the attempt names the link.
  ASSERT (SELECT p.recorded_by IS NULL AND a.invoice_link_id IS NOT NULL AND a.payer_id IS NULL
          FROM public.invoice_payments p
          JOIN public.invoice_checkout_attempts a ON a.id = p.checkout_attempt_id
          WHERE p.id = (v_claim->>'payment_id')::uuid),
    'M8: a link payment has recorded_by NULL and invoice_link_id set';

  v_retry := public.claim_invoice_link_checkout_attempt(
    'a5745000-0000-4000-8000-000000000032', v_link, 'cus_guest_32', 'card');
  ASSERT v_retry->>'attempt_id' = v_claim->>'attempt_id'
     AND v_retry->>'payment_id' = v_claim->>'payment_id'
     AND v_retry->>'return_nonce' = v_claim->>'return_nonce',
    'a same-link retry returns the one attempt and its nonce';

  -- The nonce resolves to the invoice's active token.
  ASSERT public.resolve_invoice_return_nonce(v_claim->>'return_nonce')
         = (SELECT value FROM links_state WHERE label = 'token32'),
    'the return nonce resolves to the link token';
  ASSERT public.resolve_invoice_return_nonce('garbage') IS NULL
     AND public.resolve_invoice_return_nonce(repeat('0', 64)) IS NULL,
    'a malformed or unknown nonce resolves to NULL';

  -- Finalize keys on the link; the household form of the call is a stranger.
  v_error := NULL;
  BEGIN
    PERFORM public.finalize_invoice_checkout_attempt(
      (v_claim->>'attempt_id')::uuid, 'a5740000-0000-4000-8000-000000000004',
      'cus_links_client', 'cs_link_32');
  EXCEPTION WHEN OTHERS THEN v_error := sqlerrm; END;
  ASSERT v_error = 'invoice_checkout_attempt_payer_mismatch',
    'a payer-shaped finalize on a link attempt must reject';

  v_final := public.finalize_invoice_checkout_attempt(
    (v_claim->>'attempt_id')::uuid, NULL, 'cus_guest_32', 'cs_link_32', v_link);
  ASSERT v_final->>'state' = 'session_created'
     AND v_final->>'stripe_checkout_session_id' = 'cs_link_32'
     AND (v_final->>'invoice_link_id')::uuid = v_link
     AND v_final->>'return_nonce' = v_claim->>'return_nonce',
    format('link finalize: %s', v_final);

  -- A rail change on the same link supersedes (the 00428 machinery is intact).
  v_retry := public.claim_invoice_link_checkout_attempt(
    'a5745000-0000-4000-8000-000000000032', v_link, 'cus_guest_32', 'us_bank_account');
  ASSERT v_retry->>'attempt_id' <> v_claim->>'attempt_id'
     AND v_retry->>'superseded_session_id' = 'cs_link_32'
     AND (v_retry->>'surcharge_cents')::int = 80,
    format('a rail change supersedes the link attempt (ACH fee = 80 bps of $100): %s', v_retry);
  ASSERT (SELECT state = 'superseded' AND failure_reason = 'payment_method_changed'
          FROM public.invoice_checkout_attempts WHERE id = (v_claim->>'attempt_id')::uuid),
    'the old link attempt is auditable as superseded';

  -- Settle the ACH attempt: the webhook boundary is indifferent to a NULL payer.
  PERFORM public.finalize_invoice_checkout_attempt(
    (v_retry->>'attempt_id')::uuid, NULL, 'cus_guest_32', 'cs_link_32_ach', v_link);
  ASSERT (SELECT (public.settle_invoice_checkout_payment(
            (v_retry->>'payment_id')::uuid, 'evt_link_32', 'pi_link_32', 10080, 'us_bank_account'
          ))->>'outcome') = 'succeeded',
    'a link payment settles at gross';
  ASSERT (SELECT status = 'paid' AND amount_paid_cents = 10000
          FROM public.invoices WHERE id = 'a5745000-0000-4000-8000-000000000032'),
    'the payer-less invoice is paid by its link';
  ASSERT (SELECT count(*) = 1 FROM public.designer_earnings
          WHERE invoice_payment_id = (v_retry->>'payment_id')::uuid AND net_amount = 10000),
    'the earning lands with no payer';
  ASSERT (SELECT (public.resolve_invoice_link(
            (SELECT value FROM links_state WHERE label = 'token32'), false))
          -> 'payments' -> 0 ->> 'rail') = 'us_bank_account',
    'the receipt payload names the rail';
END;
$$;

-- ── M3, case A: guest claims, walks away; the household supersedes ────────
DO $$
DECLARE
  v_link uuid;
  v_guest jsonb;
  v_house jsonb;
BEGIN
  SELECT id INTO v_link FROM public.invoice_links
  WHERE invoice_id = 'a5745000-0000-4000-8000-000000000037' AND status = 'active';
  PERFORM public.set_invoice_link_stripe_customer(v_link, 'cus_guest_37');

  v_guest := public.claim_invoice_link_checkout_attempt(
    'a5745000-0000-4000-8000-000000000037', v_link, 'cus_guest_37', 'card');
  PERFORM public.finalize_invoice_checkout_attempt(
    (v_guest->>'attempt_id')::uuid, NULL, 'cus_guest_37', 'cs_guest_37', v_link);

  v_house := public.claim_invoice_checkout_attempt(
    'a5745000-0000-4000-8000-000000000037', 'a5740000-0000-4000-8000-000000000004',
    'cus_links_client', false, 'card');
  ASSERT v_house->>'attempt_id' <> v_guest->>'attempt_id'
     AND v_house->>'superseded_session_id' = 'cs_guest_37'
     AND v_house->>'payer_id' = 'a5740000-0000-4000-8000-000000000004'
     AND v_house->'invoice_link_id' = 'null'::jsonb
     AND v_house->>'return_nonce' ~ '^[0-9a-f]{64}$',
    format('M3 A: the household must supersede the guest and get the session to expire: %s', v_house);
  ASSERT (SELECT state = 'superseded' AND failure_reason = 'actor_changed'
          FROM public.invoice_checkout_attempts WHERE id = (v_guest->>'attempt_id')::uuid),
    'M3 A: the guest attempt is superseded for actor_changed';
  ASSERT (SELECT status = 'failed' AND note LIKE '%different payer%'
          FROM public.invoice_payments WHERE id = (v_guest->>'payment_id')::uuid),
    'M3 A: the guest''s pending payment is failed with the reason';
  ASSERT (SELECT stripe_checkout_session_id IS NULL
          FROM public.invoices WHERE id = 'a5745000-0000-4000-8000-000000000037'),
    'M3 A: the invoice pointer is cleared';
  -- The household's own nonce resolves to the same token.
  ASSERT public.resolve_invoice_return_nonce(v_house->>'return_nonce')
         = (SELECT value FROM links_state WHERE label = 'token37'),
    'the household nonce resolves to the invoice link';
END;
$$;

-- ── M3, case B: the household claims; the guest supersedes ────────────────
DO $$
DECLARE
  v_link uuid;
  v_guest jsonb;
  v_house jsonb;
BEGIN
  SELECT id INTO v_link FROM public.invoice_links
  WHERE invoice_id = 'a5745000-0000-4000-8000-000000000038' AND status = 'active';
  PERFORM public.set_invoice_link_stripe_customer(v_link, 'cus_guest_38');

  v_house := public.claim_invoice_checkout_attempt(
    'a5745000-0000-4000-8000-000000000038', 'a5740000-0000-4000-8000-000000000004',
    'cus_links_client', false, 'card');
  PERFORM public.finalize_invoice_checkout_attempt(
    (v_house->>'attempt_id')::uuid, 'a5740000-0000-4000-8000-000000000004',
    'cus_links_client', 'cs_house_38');

  v_guest := public.claim_invoice_link_checkout_attempt(
    'a5745000-0000-4000-8000-000000000038', v_link, 'cus_guest_38', 'card');
  ASSERT v_guest->>'attempt_id' <> v_house->>'attempt_id'
     AND v_guest->>'superseded_session_id' = 'cs_house_38'
     AND v_guest->'payer_id' = 'null'::jsonb,
    format('M3 B: the guest must supersede the household: %s', v_guest);
  ASSERT (SELECT state = 'superseded' AND failure_reason = 'actor_changed'
          FROM public.invoice_checkout_attempts WHERE id = (v_house->>'attempt_id')::uuid),
    'M3 B: the household attempt is superseded for actor_changed';
END;
$$;

-- ── M4: finalize / recover reject a foreign customer AND a foreign link ───
DO $$
DECLARE
  v_link uuid;
  v_other uuid;
  v_claim jsonb;
  v_error text;
  v_recovered jsonb;
BEGIN
  SELECT id INTO v_link FROM public.invoice_links
  WHERE invoice_id = 'a5745000-0000-4000-8000-000000000041' AND status = 'active';
  SELECT id INTO v_other FROM public.invoice_links
  WHERE invoice_id = 'a5745000-0000-4000-8000-000000000031' AND status = 'active';
  PERFORM public.set_invoice_link_stripe_customer(v_link, 'cus_guest_41');

  v_claim := public.claim_invoice_link_checkout_attempt(
    'a5745000-0000-4000-8000-000000000041', v_link, 'cus_guest_41', 'card');

  v_error := NULL;
  BEGIN
    PERFORM public.finalize_invoice_checkout_attempt(
      (v_claim->>'attempt_id')::uuid, NULL, 'cus_foreign', 'cs_41', v_link);
  EXCEPTION WHEN OTHERS THEN v_error := sqlerrm; END;
  ASSERT v_error = 'invoice_checkout_attempt_payer_mismatch',
    'M4: finalize with a foreign customer must reject';

  v_error := NULL;
  BEGIN
    PERFORM public.finalize_invoice_checkout_attempt(
      (v_claim->>'attempt_id')::uuid, NULL, 'cus_guest_41', 'cs_41', v_other);
  EXCEPTION WHEN OTHERS THEN v_error := sqlerrm; END;
  ASSERT v_error = 'invoice_checkout_attempt_payer_mismatch',
    'M4: finalize with a foreign link id must reject';

  v_error := NULL;
  BEGIN
    PERFORM public.finalize_invoice_checkout_attempt(
      (v_claim->>'attempt_id')::uuid, NULL, 'cus_guest_41', 'cs_41', NULL);
  EXCEPTION WHEN OTHERS THEN v_error := sqlerrm; END;
  ASSERT v_error = 'invoice_checkout_attempt_payer_mismatch',
    'M4: finalize with no identity at all must reject';

  PERFORM public.finalize_invoice_checkout_attempt(
    (v_claim->>'attempt_id')::uuid, NULL, 'cus_guest_41', 'cs_41', v_link);
  ASSERT public.fail_invoice_checkout_attempt(
    (v_claim->>'attempt_id')::uuid, 'cs_41', 'checkout_session_expired'),
    'the exact session closes';

  v_error := NULL;
  BEGIN
    PERFORM public.recover_invoice_checkout_session_evidence(
      (v_claim->>'attempt_id')::uuid, NULL, 'cus_foreign', 'cs_41', v_link);
  EXCEPTION WHEN OTHERS THEN v_error := sqlerrm; END;
  ASSERT v_error = 'invoice_checkout_attempt_payer_mismatch',
    'M4: recover with a foreign customer must reject';

  v_error := NULL;
  BEGIN
    PERFORM public.recover_invoice_checkout_session_evidence(
      (v_claim->>'attempt_id')::uuid, NULL, 'cus_guest_41', 'cs_41', v_other);
  EXCEPTION WHEN OTHERS THEN v_error := sqlerrm; END;
  ASSERT v_error = 'invoice_checkout_attempt_payer_mismatch',
    'M4: recover with a foreign link id must reject';

  v_recovered := public.recover_invoice_checkout_session_evidence(
    (v_claim->>'attempt_id')::uuid, NULL, 'cus_guest_41', 'cs_41', v_link);
  ASSERT v_recovered->>'state' = 'expired'
     AND v_recovered->>'stripe_checkout_session_id' = 'cs_41'
     AND (v_recovered->>'invoice_link_id')::uuid = v_link,
    format('M4: exact recovery on the link attempt: %s', v_recovered);
END;
$$;
RESET ROLE;

-- ── M11 / M10 on invoice 39: claimed → session_created → processing ───────
DO $$
DECLARE
  v_link uuid;
  v_claim jsonb;
  v_error text;
BEGIN
  SET LOCAL ROLE service_role;
  SELECT id INTO v_link FROM public.invoice_links
  WHERE invoice_id = 'a5745000-0000-4000-8000-000000000039' AND status = 'active';
  PERFORM public.set_invoice_link_stripe_customer(v_link, 'cus_guest_39');
  v_claim := public.claim_invoice_link_checkout_attempt(
    'a5745000-0000-4000-8000-000000000039', v_link, 'cus_guest_39', 'us_bank_account');
  INSERT INTO links_state VALUES ('attempt39', v_claim->>'attempt_id');
  INSERT INTO links_state VALUES ('payment39', v_claim->>'payment_id');
  RESET ROLE;

  -- claimed
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.assume_links_actor('a5740000-0000-4000-8000-000000000001');
  v_error := NULL;
  BEGIN
    PERFORM public.regenerate_invoice_link('a5745000-0000-4000-8000-000000000039');
  EXCEPTION WHEN OTHERS THEN v_error := sqlerrm; END;
  ASSERT v_error = 'invoice_checkout_in_progress', 'M11: regenerate refuses while claimed';
  RESET ROLE;

  -- session_created
  SET LOCAL ROLE service_role;
  PERFORM public.finalize_invoice_checkout_attempt(
    (v_claim->>'attempt_id')::uuid, NULL, 'cus_guest_39', 'cs_39', v_link);
  RESET ROLE;
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.assume_links_actor('a5740000-0000-4000-8000-000000000001');
  v_error := NULL;
  BEGIN
    PERFORM public.regenerate_invoice_link('a5745000-0000-4000-8000-000000000039');
  EXCEPTION WHEN OTHERS THEN v_error := sqlerrm; END;
  ASSERT v_error = 'invoice_checkout_in_progress', 'M11: regenerate refuses while session_created';
  RESET ROLE;

  -- processing (the PI stamp moves the attempt, as the integrity suite shows)
  UPDATE public.invoice_payments SET stripe_payment_intent_id = 'pi_39'
  WHERE id = (v_claim->>'payment_id')::uuid;
  ASSERT (SELECT state = 'processing' FROM public.invoice_checkout_attempts
          WHERE id = (v_claim->>'attempt_id')::uuid),
    'the PI stamp puts the attempt in processing';
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.assume_links_actor('a5740000-0000-4000-8000-000000000001');
  v_error := NULL;
  BEGIN
    PERFORM public.regenerate_invoice_link('a5745000-0000-4000-8000-000000000039');
  EXCEPTION WHEN OTHERS THEN v_error := sqlerrm; END;
  ASSERT v_error = 'invoice_checkout_in_progress', 'M11: regenerate refuses while processing';

  -- M10: void refuses while ACH money is in flight.
  v_error := NULL;
  BEGIN
    PERFORM public.void_invoice('a5745000-0000-4000-8000-000000000039', 'Too late.');
  EXCEPTION WHEN OTHERS THEN v_error := sqlerrm; END;
  ASSERT v_error = 'invoice_checkout_in_progress', 'M10: void refuses while processing';
  RESET ROLE;
  ASSERT (SELECT status = 'sent' FROM public.invoices
          WHERE id = 'a5745000-0000-4000-8000-000000000039'),
    'M10: the refused void changed nothing';
  ASSERT (SELECT status = 'active' FROM public.invoice_links WHERE id = v_link),
    'M10: the refused void left the link active';
END;
$$;

-- ── M10: void succeeds for claimed (35) and session_created (40); the link
--    closes; K5 withdrawn sheet ─────────────────────────────────────────────
SET LOCAL ROLE service_role;
DO $$
DECLARE v_claim jsonb;
BEGIN
  v_claim := public.claim_invoice_checkout_attempt(
    'a5745000-0000-4000-8000-000000000035', 'a5740000-0000-4000-8000-000000000004',
    'cus_links_client', false, 'card');
  INSERT INTO links_state VALUES ('attempt35', v_claim->>'attempt_id');
  v_claim := public.claim_invoice_checkout_attempt(
    'a5745000-0000-4000-8000-000000000040', 'a5740000-0000-4000-8000-000000000004',
    'cus_links_client', false, 'card');
  PERFORM public.finalize_invoice_checkout_attempt(
    (v_claim->>'attempt_id')::uuid, 'a5740000-0000-4000-8000-000000000004',
    'cus_links_client', 'cs_40');
  INSERT INTO links_state VALUES ('attempt40', v_claim->>'attempt_id');
END;
$$;
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT pg_temp.assume_links_actor('a5740000-0000-4000-8000-000000000001');
DO $$
BEGIN
  PERFORM public.void_invoice('a5745000-0000-4000-8000-000000000035', 'Withdrawn.');
  PERFORM public.void_invoice('a5745000-0000-4000-8000-000000000040', 'Withdrawn too.');
END;
$$;
RESET ROLE;

SET LOCAL ROLE service_role;
DO $$
DECLARE v jsonb; v_key text;
BEGIN
  ASSERT (SELECT bool_and(status = 'void') FROM public.invoices
          WHERE id IN ('a5745000-0000-4000-8000-000000000035','a5745000-0000-4000-8000-000000000040')),
    'M10: void succeeds for claimed and session_created';
  -- The 00397 sync trigger closes the attempt when its payment fails, before
  -- the void body's own guarded UPDATE runs, so failure_reason is not pinned.
  ASSERT (SELECT bool_and(state = 'failed')
          FROM public.invoice_checkout_attempts
          WHERE id IN ((SELECT value::uuid FROM links_state WHERE label = 'attempt35'),
                       (SELECT value::uuid FROM links_state WHERE label = 'attempt40'))),
    'M10: the attempts are closed by the void';
  ASSERT (SELECT bool_and(status = 'closed' AND revoked_at IS NOT NULL)
          FROM public.invoice_links
          WHERE invoice_id IN ('a5745000-0000-4000-8000-000000000035','a5745000-0000-4000-8000-000000000040')),
    'M9: void closes the link';

  -- K5: the withdrawn sheet — letterhead, number, title, contact; nothing to pay.
  v := public.resolve_invoice_link((SELECT value FROM links_state WHERE label = 'token35'));
  ASSERT v->>'kind' = 'withdrawn' AND v->>'sheet' = 'withdrawn',
    format('K5: a closed link renders withdrawn: %s', v);
  ASSERT v->'invoice'->>'number' = 'INV-L-35'
     AND v->'studio'->>'name' = 'Links Studio One'
     AND v->>'designer_display_name' = 'Links Owner'
     AND v->'contact'->>'designer_display_name' = 'Links Owner',
    format('K5: withdrawn carries the letterhead and contact: %s', v);
  ASSERT v ? 'invoice' AND v ? 'studio' AND v ? 'contact'
     AND NOT (v ? 'line_items') AND NOT (v ? 'payments') AND NOT (v ? 'pay')
     AND NOT (v ? 'payment_options')
     AND NOT (v->'invoice' ? 'total_cents') AND NOT (v->'invoice' ? 'balance_cents'),
    'K5: withdrawn carries no amounts, no lines, no chooser';
  FOR v_key IN SELECT * FROM pg_temp.jsonb_deep_keys(v) LOOP
    ASSERT v_key <> 'id' AND v_key NOT LIKE '%\_id'
       AND v_key NOT IN ('void_reason','voided_at','token','email','payer_email'),
      format('forbidden key in withdrawn payload: %s', v_key);
  END LOOP;
  ASSERT NOT EXISTS (SELECT 1 FROM public.resolve_invoice_link_for_checkout(
                       (SELECT value FROM links_state WHERE label = 'token35'))),
    'a closed link cannot check out';
  ASSERT public.ensure_invoice_link('a5745000-0000-4000-8000-000000000035') IS NULL,
    'ensure_invoice_link is NULL for a void invoice';
  -- A payer returning from Stripe after the void lands on the withdrawn sheet.
  ASSERT public.resolve_invoice_return_nonce(
           (SELECT return_nonce FROM public.invoice_checkout_attempts
            WHERE id = (SELECT value::uuid FROM links_state WHERE label = 'attempt40')))
         = (SELECT value FROM links_state WHERE label = 'token40'),
    'the nonce still resolves to the closed link''s token';
END;
$$;

-- ── M10: the settling sheet — closed + pending, closed + requires_refund ──
DO $$
DECLARE v_claim jsonb; v jsonb; v_key text;
BEGIN
  v_claim := public.claim_invoice_checkout_attempt(
    'a5745000-0000-4000-8000-000000000036', 'a5740000-0000-4000-8000-000000000004',
    'cus_links_client', false, 'card');
  PERFORM public.finalize_invoice_checkout_attempt(
    (v_claim->>'attempt_id')::uuid, 'a5740000-0000-4000-8000-000000000004',
    'cus_links_client', 'cs_36');
  INSERT INTO links_state VALUES ('payment36', v_claim->>'payment_id');
END;
$$;
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT pg_temp.assume_links_actor('a5740000-0000-4000-8000-000000000001');
DO $$
BEGIN
  PERFORM public.void_invoice('a5745000-0000-4000-8000-000000000036', 'Withdrawn mid-checkout.');
END;
$$;
RESET ROLE;
SET LOCAL ROLE service_role;
DO $$
DECLARE v jsonb; v_key text; v_pending uuid;
BEGIN
  ASSERT (public.resolve_invoice_link((SELECT value FROM links_state WHERE label = 'token36')))->>'kind'
         = 'withdrawn',
    'a void with its attempt closed is withdrawn';

  -- closed + pending: a Stripe row still pending on the void invoice.
  INSERT INTO public.invoice_payments (invoice_id, amount_cents, method, status, note)
  VALUES ('a5745000-0000-4000-8000-000000000036', 10000, 'stripe', 'pending', 'late')
  RETURNING id INTO v_pending;
  v := public.resolve_invoice_link((SELECT value FROM links_state WHERE label = 'token36'));
  ASSERT v->>'kind' = 'settling' AND v->>'sheet' = 'settling',
    format('closed + pending renders settling: %s', v);
  ASSERT v->'invoice'->>'number' = 'INV-L-36' AND v->'studio'->>'name' = 'Links Studio One',
    'settling carries the letterhead and number';
  ASSERT NOT (v ? 'line_items') AND NOT (v ? 'pay') AND NOT (v->'invoice' ? 'balance_cents'),
    'settling carries no amounts, no chooser';
  DELETE FROM public.invoice_payments WHERE id = v_pending;

  -- closed + requires_refund: the late charge on the voided attempt.
  ASSERT (public.settle_invoice_checkout_payment(
            (SELECT value::uuid FROM links_state WHERE label = 'payment36'),
            'evt_36_late', 'pi_36_late', 10300, 'card'))->>'outcome' = 'requires_refund',
    'a late charge on a voided attempt requires refund';
  v := public.resolve_invoice_link((SELECT value FROM links_state WHERE label = 'token36'));
  ASSERT v->>'kind' = 'settling', format('closed + requires_refund renders settling: %s', v);
  FOR v_key IN SELECT * FROM pg_temp.jsonb_deep_keys(v) LOOP
    ASSERT v_key <> 'id' AND v_key NOT LIKE '%\_id' AND v_key NOT IN ('token','email','payer_email','note'),
      format('forbidden key in settling payload: %s', v_key);
  END LOOP;
END;
$$;

-- ── The sweep: stale claimed attempts expire; processing never does ───────
DO $$
DECLARE
  v_link uuid;
  v_claim jsonb;
  v_result jsonb;
BEGIN
  SELECT id INTO v_link FROM public.invoice_links
  WHERE invoice_id = 'a5745000-0000-4000-8000-000000000046' AND status = 'active';
  PERFORM public.set_invoice_link_stripe_customer(v_link, 'cus_guest_46');
  v_claim := public.claim_invoice_link_checkout_attempt(
    'a5745000-0000-4000-8000-000000000046', v_link, 'cus_guest_46', 'card');
  PERFORM public.finalize_invoice_checkout_attempt(
    (v_claim->>'attempt_id')::uuid, NULL, 'cus_guest_46', 'cs_46_stale', v_link);
  INSERT INTO links_state VALUES ('attempt46', v_claim->>'attempt_id');

  -- Backdate both the abandoned session (46) and the in-flight ACH (39).
  UPDATE public.invoice_checkout_attempts SET created_at = now() - interval '25 hours'
  WHERE id IN ((v_claim->>'attempt_id')::uuid,
               (SELECT value::uuid FROM links_state WHERE label = 'attempt39'));

  -- A one-hour-old claim is not stale.
  v_result := public.expire_stale_invoice_checkout_attempts('26 hours');
  ASSERT (v_result->>'expired')::int = 0, format('nothing older than 26h: %s', v_result);

  v_result := public.expire_stale_invoice_checkout_attempts();
  -- pointers_cleared is 0 here: the 00397 sync trigger already cleared the
  -- invoice pointer when the pending payment failed; the sweep's own clear is
  -- defence in depth for an attempt with no payment row.
  ASSERT (v_result->>'expired')::int = 1
     AND (v_result->>'payments_failed')::int = 1,
    format('the sweep expires exactly the abandoned attempt: %s', v_result);
  ASSERT (SELECT state = 'expired' AND failure_reason = 'stale_checkout_attempt'
          FROM public.invoice_checkout_attempts WHERE id = (v_claim->>'attempt_id')::uuid),
    'the abandoned attempt is expired';
  ASSERT (SELECT status = 'failed' FROM public.invoice_payments
          WHERE id = (v_claim->>'payment_id')::uuid),
    'the abandoned pending payment is failed';
  ASSERT (SELECT stripe_checkout_session_id IS NULL FROM public.invoices
          WHERE id = 'a5745000-0000-4000-8000-000000000046'),
    'the abandoned pointer is cleared';
  ASSERT (SELECT state = 'processing' FROM public.invoice_checkout_attempts
          WHERE id = (SELECT value::uuid FROM links_state WHERE label = 'attempt39')),
    'processing is never swept';
  ASSERT (SELECT count(*) = 2 FROM public.job_runs
          WHERE job_name = 'invoice-checkout-attempts-expire' AND status = 'succeeded'
            AND started_at > now() - interval '1 minute'),
    'each sweep writes one succeeded job_runs row';
  ASSERT (SELECT detail->>'expired' = '1' FROM public.job_runs
          WHERE job_name = 'invoice-checkout-attempts-expire'
          ORDER BY id DESC LIMIT 1),
    'the job_runs detail records the work';

  -- With the stale attempt cleared, Regenerate works and the new link claims
  -- fresh — the post-Regenerate case.
  RESET ROLE;
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.assume_links_actor('a5740000-0000-4000-8000-000000000001');
  INSERT INTO links_state VALUES (
    'token46b', public.regenerate_invoice_link('a5745000-0000-4000-8000-000000000046'));
  RESET ROLE;
  SET LOCAL ROLE service_role;
  ASSERT (SELECT status = 'revoked' FROM public.invoice_links WHERE id = v_link),
    'the old link is revoked';
  ASSERT public.resolve_invoice_link((SELECT value FROM links_state WHERE label = 'token46')) IS NULL,
    'the old token is dead';
  ASSERT public.resolve_invoice_link((SELECT value FROM links_state WHERE label = 'token46b')) IS NOT NULL,
    'the new token resolves';
  ASSERT public.resolve_invoice_return_nonce(v_claim->>'return_nonce')
         = (SELECT value FROM links_state WHERE label = 'token46b'),
    'an old nonce follows the invoice to its new active token';

  SELECT id INTO v_link FROM public.invoice_links
  WHERE invoice_id = 'a5745000-0000-4000-8000-000000000046' AND status = 'active';
  ASSERT (SELECT stripe_customer_id IS NULL FROM public.invoice_links WHERE id = v_link),
    'a fresh link has no Stripe customer yet';
  PERFORM public.set_invoice_link_stripe_customer(v_link, 'cus_guest_46b');
  v_claim := public.claim_invoice_link_checkout_attempt(
    'a5745000-0000-4000-8000-000000000046', v_link, 'cus_guest_46b', 'card');
  ASSERT (v_claim->>'invoice_link_id')::uuid = v_link
     AND v_claim->'superseded_session_id' = 'null'::jsonb
     AND v_claim->>'state' = 'claimed',
    format('the new link claims fresh after the sweep: %s', v_claim);
END;
$$;
RESET ROLE;

ROLLBACK;
