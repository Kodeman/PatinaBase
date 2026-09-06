-- Web walk r1 · make "Aspen Loft — Stair and rail" a real signature gate.
-- list_client_proposals reads proposals.document_kind / commercial_state, not
-- the binding row, so both must say trade_scope / sent. LOCAL ONLY.
BEGIN;
SET LOCAL session_replication_role = 'replica';
UPDATE public.proposals
   SET document_kind = 'trade_scope',
       commercial_state = 'sent',
       status = 'sent',
       sent_at = COALESCE(sent_at, now() - interval '3 days'),
       valid_until = (now() + interval '20 days')::date
 WHERE id = 'b0000000-0000-0000-0000-0000000cd102';
SET LOCAL session_replication_role = 'origin';
COMMIT;
SELECT id, left(title,32) t, status, document_kind, commercial_state, valid_until
  FROM public.proposals WHERE id = 'b0000000-0000-0000-0000-0000000cd102';
