\set ON_ERROR_STOP on
BEGIN;
SET LOCAL search_path = public;
SELECT id AS inv, designer_id AS dz FROM public.invoices WHERE status='sent' LIMIT 1 \gset
\echo 'invoice:' :inv

DELETE FROM public.invoice_links WHERE invoice_id=:'inv';

\echo '--- 1. ensure_invoice_link mints a live address'
SELECT public.ensure_invoice_link(:'inv') AS tok1 \gset
SELECT :'tok1' ~ '^[0-9a-f]{64}$' AS shape, (public.resolve_invoice_link(:'tok1', false)->>'kind') AS kind;

\echo '--- 2. a second call REGENERATES and the first address dies'
SELECT public.ensure_invoice_link(:'inv') AS tok2 \gset
SELECT :'tok2' <> :'tok1' AS fresh,
       public.resolve_invoice_link(:'tok1', false) IS NULL AS old_dead,
       (public.resolve_invoice_link(:'tok2', false)->>'kind') AS new_kind;

\echo '--- 3. get_invoice_link hands back state and no address'
SET LOCAL role = authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub',:'dz','role','authenticated')::text, true);
SELECT public.get_invoice_link(:'inv');
RESET role; SELECT set_config('request.jwt.claims', NULL, true);

\echo '--- 4. an EXPIRED active link: resolvers refuse, get_invoice_link still says active (r2 MINOR 13)'
UPDATE public.invoice_links SET expires_at = now() - interval '1 day' WHERE invoice_id=:'inv' AND status='active';
SELECT public.resolve_invoice_link(:'tok2', false) IS NULL AS resolve_refuses,
       (SELECT count(*) FROM public.resolve_invoice_link_for_checkout(:'tok2')) AS checkout_rows,
       public.invoice_link_is_live(:'inv') AS is_live;
SET LOCAL role = authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub',:'dz','role','authenticated')::text, true);
SELECT public.get_invoice_link(:'inv') AS reader_says;
RESET role; SELECT set_config('request.jwt.claims', NULL, true);

\echo '--- 5. resolve_invoice_return_nonce on a CLOSED link: rotates and re-dates a dead grant (r2 MINOR 12)'
UPDATE public.invoice_links SET status='closed', revoked_at=now(), expires_at = now() - interval '5 days' WHERE invoice_id=:'inv';
INSERT INTO public.invoice_checkout_attempts (invoice_id, return_nonce, state, created_at, stripe_customer_id, amount_cents, currency, stripe_idempotency_key, invoice_link_id)
VALUES (:'inv', repeat('cd',32), 'claimed', now(), 'cus_probe_r3', 1000, 'usd', 'idem_probe_r3', (SELECT id FROM public.invoice_links WHERE invoice_id=:'inv' LIMIT 1));
SELECT public.resolve_invoice_return_nonce(repeat('cd',32)) AS rotated \gset
SELECT :'rotated' ~ '^[0-9a-f]{64}$' AS rotated_shape,
       (SELECT status FROM public.invoice_links WHERE invoice_id=:'inv' ORDER BY created_at DESC LIMIT 1) AS link_status,
       (SELECT expires_at > now() + interval '29 days' FROM public.invoice_links WHERE invoice_id=:'inv' ORDER BY created_at DESC LIMIT 1) AS refreshed_30d,
       (SELECT revoked_at IS NOT NULL FROM public.invoice_links WHERE invoice_id=:'inv' ORDER BY created_at DESC LIMIT 1) AS still_revoked_stamp;
\echo '--- what v_access_grants says about that closed-but-re-dated grant'
SET LOCAL role = authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub',:'dz','role','authenticated')::text, true);
SELECT tier, expires_at > now() AS expiry_in_future, revoked_at IS NOT NULL AS revoked, revoke_reason
FROM public.v_access_grants WHERE tier='invoice_pay' AND scope_id=:'inv';
RESET role; SELECT set_config('request.jwt.claims', NULL, true);
ROLLBACK;
