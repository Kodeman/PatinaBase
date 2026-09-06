-- Put the walk's own door back on the mat so the swing and the receipt can be
-- read in one pass (the first pass proved the POST, then the leaf was gone
-- before the receipt could be photographed).
--
-- Replica mode, deliberately: the commercial guards are capability-GUC gated
-- and this is a fixture rewinding its own history, exactly as
-- `the-client-page.sql` materialises one. Local stack only, and only on the
-- proposal this walk minted.
\set ON_ERROR_STOP on
\set QUIET on
\pset pager off
\set DOORPROP '''b0000000-0000-0000-0000-0000000cd004'''

\o /dev/null
BEGIN;
SET LOCAL session_replication_role = 'replica';

DELETE FROM public.commercial_document_signatures
 WHERE proposal_id = (:DOORPROP)::uuid;

UPDATE public.proposals
   SET commercial_state = 'sent',
       status = 'sent',
       signed_at = NULL,
       signed_by_name = NULL,
       signed_ip = NULL,
       accepted_at = NULL
 WHERE id = (:DOORPROP)::uuid;

SET LOCAL session_replication_role = 'origin';
COMMIT;

\o
\pset format unaligned
\pset tuples_only on
SELECT jsonb_build_object('state', commercial_state, 'status', status,
                          'signatures', (SELECT count(*) FROM public.commercial_document_signatures
                                          WHERE proposal_id = (:DOORPROP)::uuid))::text
  FROM public.proposals WHERE id = (:DOORPROP)::uuid;
