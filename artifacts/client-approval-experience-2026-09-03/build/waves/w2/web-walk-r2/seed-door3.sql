-- Web walk r2 · a SECOND door, so the 390px act ranking can be measured after
-- the first one was signed. "Aspen Loft — Library joinery" (…cd201) is bound
-- and dressed as a trade scope, with the terms + draw schedule the execution
-- RPC needs. LOCAL ONLY.
\set ON_ERROR_STOP on
\set P '''b0000000-0000-0000-0000-0000000cd201'''
BEGIN;
SET LOCAL session_replication_role = 'replica';
INSERT INTO public.project_commercial_documents
  (project_id, proposal_id, document_kind, wave_name, is_origin, created_by)
VALUES ('b0000000-0000-0000-0000-0000000000d1', :P, 'trade_scope', NULL, false,
        'a0000000-0000-0000-0000-000000000004')
ON CONFLICT (proposal_id) DO NOTHING;
UPDATE public.proposals
   SET document_kind = 'trade_scope', commercial_state = 'sent', status = 'sent',
       sent_at = COALESCE(sent_at, now() - interval '2 days'),
       valid_until = (now() + interval '20 days')::date
 WHERE id = :P;
INSERT INTO public.trade_scope_terms
  (proposal_id, party_display_name, party_trade, client_price_cents, currency, terms)
VALUES (:P, 'Ridgeline Joinery', 'Joinery', 680000, 'USD',
        'Deposit on signature; balance billed as the work reaches each stage.')
ON CONFLICT (proposal_id) DO NOTHING;
INSERT INTO public.trade_scope_draws
  (proposal_id, label, percentage, amount_cents, sort_order, gates_on_acceptance)
VALUES (:P, 'Deposit', 30, 204000, 0, false),
       (:P, 'Substantial completion', 70, 476000, 1, false);
SET LOCAL session_replication_role = 'origin';
COMMIT;
SELECT id, left(title,32) t, status, document_kind, commercial_state FROM public.proposals WHERE id = :P;
