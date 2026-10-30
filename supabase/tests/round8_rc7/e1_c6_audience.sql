\set ON_ERROR_STOP on
-- RC7-E1-1 (K9, fixed by migration 00903): the C6 client projection lists a
-- completion only to the project client or an active signer of the request
-- that contributed it. A prior-request signer who is NOT on the contributing
-- request (profile 8, linked to household card 5 on r1/r2, not on r4) passes
-- the unchanged entry gate and reads completions = []; so does a signer
-- replaced on the contributing request (K9 review). In the e1_*.sql gate since
-- RC8-FIX7 (renamed from defect_e1_c6_audience.sql).
-- Owned stack only (default 127.0.0.1:58122, the E1 stack; pass
-- -v expected_port=<n> for another owned stack, never the shared 54322),
-- with scope_editions inactive. Rolled back.
\if :{?expected_port}
\else
\set expected_port 58122
\endif
SELECT :'HOST'='127.0.0.1' AND :'PORT'=:'expected_port' AND :'PORT'<>'54322' AND
 (SELECT NOT enabled FROM public.server_capabilities WHERE key='scope_editions') AS owned \gset
\if :owned
\else
DO $$ BEGIN RAISE EXCEPTION 'E1 C6 audience suite requires an inactive owned 127.0.0.1 stack (not 54322)'; END $$;
\quit
\endif
BEGIN;
\ir ../round8/service_acceptance_release_fixes_body.psql
GRANT EXECUTE ON FUNCTION pg_temp.project(text) TO authenticated;
CREATE TEMP TABLE e1_c6_reads(actor integer PRIMARY KEY, result jsonb NOT NULL);
GRANT INSERT ON e1_c6_reads TO authenticated;
-- Both calls must succeed: an exception here stops the file (ON_ERROR_STOP).
SELECT pg_temp.actor(6);
SET LOCAL ROLE authenticated;
INSERT INTO e1_c6_reads SELECT 6,public.get_studio_service_completion(pg_temp.project());
RESET ROLE;
SELECT pg_temp.actor(8);
SET LOCAL ROLE authenticated;
INSERT INTO e1_c6_reads SELECT 8,public.get_studio_service_completion(pg_temp.project());
RESET ROLE;
SELECT pg_temp.assert_true((SELECT result->>'audience'='client'
 AND jsonb_array_length(result->'completions')=1
 AND (result->'completions'->0->>'acceptanceRequestId')::uuid=pg_temp.req('r4')
 FROM e1_c6_reads WHERE actor=6),
 'RC7-E1-1 control: r4 signer 6 reads exactly the r4 completion in the client projection');
SELECT pg_temp.assert_true((SELECT result->>'audience'='client' AND result->'completions'='[]'::jsonb
 FROM e1_c6_reads WHERE actor=8),
 'RC7-E1-1: prior-request signer 8, not on r4, reads no completion; observed completions '
 ||(SELECT (result->'completions')::text FROM e1_c6_reads WHERE actor=8));

-- K9 review: a signer REPLACED on the contributing request, still admitted
-- through the unchanged entry gate by another sent request, sees nothing. This
-- guards the row filter's s.status = 'active'. 7 holds r4's partner slot (card
-- 3) and active partner slots on earlier sent requests (request 2 among them). A closed request
-- cannot be repaired through replace_service_acceptance_signer (request_not_open),
-- so the replacement is constructed in place, as an audited replacement leaves it:
-- the old slot replaced, a successor slot for card 6 (linked to 9) active.
CREATE TEMP TABLE e1_c6_replaced(read text PRIMARY KEY, result jsonb NOT NULL);
GRANT INSERT ON e1_c6_replaced TO authenticated;
SELECT pg_temp.actor(7);
SET LOCAL ROLE authenticated;
INSERT INTO e1_c6_replaced SELECT '7-before',public.get_studio_service_completion(pg_temp.project());
RESET ROLE;
SELECT pg_temp.assert_true((SELECT jsonb_array_length(result->'completions')=1
 AND (result->'completions'->0->>'acceptanceRequestId')::uuid=pg_temp.req('r4')
 FROM e1_c6_replaced WHERE read='7-before'),
 'K9 control: active r4 partner 7 reads the r4 completion');
SET LOCAL session_replication_role=replica;
WITH old AS (
  UPDATE public.service_acceptance_signers SET status='replaced',
    replaced_by_signer_id='e1c60000-0000-4000-8000-000000000001', replacement_reason='Partner moved out',
    replaced_by=pg_temp.uid(1), replaced_at=now(), replacement_client_request_id='e1-c6-replace',
    replacement_request_hash=repeat('e',64), replacement_policy_revision=2, replacement_lapsed_intake_ids='{}'
  WHERE request_id=pg_temp.req('r4') AND slot='partner' AND status='active' RETURNING *)
INSERT INTO public.service_acceptance_signers(id,request_id,slot,required,household_person_id,policy_slot)
SELECT 'e1c60000-0000-4000-8000-000000000001',request_id,slot,required,pg_temp.card(6),policy_slot FROM old;
SET LOCAL session_replication_role=origin;
SELECT pg_temp.assert_true(EXISTS (SELECT 1 FROM public.service_acceptance_signers s
   JOIN public.service_acceptance_requests q ON q.id=s.request_id
   WHERE q.project_id=pg_temp.project() AND q.id<>pg_temp.req('r4') AND q.sent_at IS NOT NULL
     AND s.status='active' AND s.household_person_id=pg_temp.card(3))
 AND (SELECT status='replaced' FROM public.service_acceptance_signers
   WHERE request_id=pg_temp.req('r4') AND household_person_id=pg_temp.card(3)),
 'K9 fixture: 7 is replaced on r4 and still an active signer on another sent request');
SELECT pg_temp.actor(7);
SET LOCAL ROLE authenticated;
INSERT INTO e1_c6_replaced SELECT '7-after',public.get_studio_service_completion(pg_temp.project());
RESET ROLE;
SELECT pg_temp.actor(9);
SET LOCAL ROLE authenticated;
INSERT INTO e1_c6_replaced SELECT '9-after',public.get_studio_service_completion(pg_temp.project());
RESET ROLE;
SELECT pg_temp.assert_true((SELECT result->>'audience'='client' AND result->'completions'='[]'::jsonb
 FROM e1_c6_replaced WHERE read='7-after'),
 'K9: 7, replaced on the contributing request but admitted by an earlier sent request, reads no completion; observed '
 ||(SELECT (result->'completions')::text FROM e1_c6_replaced WHERE read='7-after'));
SELECT pg_temp.assert_true((SELECT jsonb_array_length(result->'completions')=1
 AND (result->'completions'->0->>'acceptanceRequestId')::uuid=pg_temp.req('r4')
 FROM e1_c6_replaced WHERE read='9-after'),
 'K9: the replacement signer 9 (card 6), active on r4, reads the r4 completion');
DO $$ BEGIN RAISE NOTICE 'E1 C6 audience: PASS 6 assertions'; END $$;
ROLLBACK;
