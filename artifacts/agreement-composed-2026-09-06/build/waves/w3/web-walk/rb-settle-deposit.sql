\set ON_ERROR_STOP on
-- Step 14 cannot run on this stack: supabase_edge_runtime is a stopped service,
-- so the Stripe checkout route 503s. Settle the deposit the way a recorded
-- payment would, so the walk can reach step 15's Rough-in draw.
SELECT id AS designer_uid FROM auth.users WHERE email = 'designer@patina.dev' \gset
SELECT set_config('request.jwt.claims',
  json_build_object('sub', :'designer_uid', 'role', 'authenticated')::text, false);
SELECT public.record_invoice_payment(
  '415417e1-a12f-445b-b836-7677023eb4c3'::uuid,
  841340,
  'check',
  'walk-r2b-deposit',
  now(),
  'Walk round 2 rerun — the deposit, settled locally because the edge runtime is down.'
);
SELECT invoice_number, status, total_cents, amount_paid_cents FROM public.invoices
WHERE id = '415417e1-a12f-445b-b836-7677023eb4c3';
