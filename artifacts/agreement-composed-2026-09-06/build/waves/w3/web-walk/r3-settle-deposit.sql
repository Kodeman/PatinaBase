\set ON_ERROR_STOP on
-- Step 14 cannot complete through Stripe on this stack: the checkout route answers
-- 500 stripe_not_configured (no Stripe keys are set locally). Settle the deposit the
-- way a recorded payment would, so the walk can reach step 15's Rough-in draw.
SELECT id AS designer_uid FROM auth.users WHERE email = 'designer@patina.dev' \gset
SELECT set_config('request.jwt.claims',
  json_build_object('sub', :'designer_uid', 'role', 'authenticated')::text, false);
SELECT public.record_invoice_payment(
  '07e7a4ed-32c1-49a8-b034-2bb3628772b1'::uuid,
  841340,
  'check',
  'walk-r3-deposit',
  now(),
  'Walk round 3 — the deposit, settled locally because Stripe is not configured on this stack.'
);
SELECT invoice_number, status, total_cents, amount_paid_cents FROM public.invoices
WHERE id = '07e7a4ed-32c1-49a8-b034-2bb3628772b1';
