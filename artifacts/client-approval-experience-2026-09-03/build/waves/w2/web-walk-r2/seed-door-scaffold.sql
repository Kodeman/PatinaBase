-- Web walk r2 · the door needs a scaffold the seeds do not build.
-- LOCAL STACK ONLY. `Aspen Loft — Stair and rail` (…cd102) was bound as a
-- trade_scope in round 1, but `execute_trade_scope_with_trusted_ip` also needs
-- (a) the project to carry a studio the designer owns and (b) a draw schedule
-- to bill. Neither is in the repo seeds — every seeded project has NULL
-- studio_id and no trade_scope_terms/draws row exists anywhere.
\set ON_ERROR_STOP on
BEGIN;
-- the terms/draws guards refuse a write after the scope leaves draft; this is
-- scaffolding for a walk, not a product path.
SET LOCAL session_replication_role = 'replica';
UPDATE public.projects
   SET studio_id = 'b0000000-0000-0000-0000-000000000001'
 WHERE id = 'b0000000-0000-0000-0000-0000000000d1'
   AND studio_id IS NULL;

INSERT INTO public.trade_scope_terms (
  proposal_id, party_display_name, party_trade, client_price_cents, currency, terms
) VALUES (
  'b0000000-0000-0000-0000-0000000cd102', 'Hollow Stair Works', 'Stair and rail',
  960000, 'USD', 'Deposit on signature; balance billed as the work reaches each stage.'
) ON CONFLICT (proposal_id) DO NOTHING;

INSERT INTO public.trade_scope_draws (
  proposal_id, label, percentage, amount_cents, sort_order, gates_on_acceptance
) VALUES
  ('b0000000-0000-0000-0000-0000000cd102', 'Deposit', 30, 288000, 0, false),
  ('b0000000-0000-0000-0000-0000000cd102', 'Substantial completion', 70, 672000, 1, false);
COMMIT;
