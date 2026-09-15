\set ON_ERROR_STOP on
BEGIN;
SET LOCAL search_path = public;

-- Rebuild a PRE-00636 invoice_links row, then replay 00636 §2's statements verbatim.
ALTER TABLE public.invoice_links DROP CONSTRAINT chk_invoice_links_token_frozen;
ALTER TABLE public.invoice_links ALTER COLUMN token_hash DROP NOT NULL;

-- an issued invoice to hang it on
SELECT id AS inv FROM public.invoices WHERE status IN ('sent','partially_paid','paid') LIMIT 1 \gset
\echo 'invoice used:' :inv

INSERT INTO public.invoice_links (invoice_id, token, token_hash, status, created_at)
VALUES (:'inv', repeat('ab',32), NULL, 'active', now() - interval '400 days');

-- ── 00636 §2, verbatim
UPDATE public.invoice_links SET token_hash = public.invoice_link_token_hash(token)
 WHERE token_hash IS NULL AND token IS NOT NULL;
UPDATE public.invoice_links
   SET expires_at = CASE WHEN status='active' THEN now() + interval '30 days'
                         ELSE COALESCE(revoked_at, created_at) END
 WHERE expires_at IS NULL;
UPDATE public.invoice_links SET token = NULL WHERE token IS NOT NULL;
ALTER TABLE public.invoice_links ADD CONSTRAINT chk_invoice_links_token_frozen CHECK (token IS NULL);
ALTER TABLE public.invoice_links ALTER COLUMN token_hash SET NOT NULL;

\echo '--- the address the client already holds still resolves'
SELECT (public.resolve_invoice_link(repeat('ab',32), false)->>'kind') AS kind_for_legacy_token;
\echo '--- the plaintext column answers nothing'
SELECT count(*) AS rows_with_plaintext FROM public.invoice_links WHERE token IS NOT NULL;
\echo '--- checkout resolver also matches the legacy token'
SELECT count(*) AS checkout_rows FROM public.resolve_invoice_link_for_checkout(repeat('ab',32));
\echo '--- a 400-day-old link got a FULL 30 days from the migration, not from created_at'
SELECT expires_at > now() + interval '29 days' AS full_30_days FROM public.invoice_links WHERE invoice_id=:'inv' ORDER BY created_at LIMIT 1;
\echo '--- the stored hash is useless as a bearer token'
SELECT public.resolve_invoice_link((SELECT token_hash FROM public.invoice_links WHERE invoice_id=:'inv' ORDER BY created_at LIMIT 1), false) IS NULL AS hash_is_not_a_token;
ROLLBACK;
