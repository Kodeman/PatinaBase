\set ON_ERROR_STOP on
SELECT :'HOST'='127.0.0.1' AND :'PORT'='58122' AND
 (SELECT NOT enabled FROM public.server_capabilities WHERE key='scope_editions') AS owned \gset
\if :owned
\else
DO $$ BEGIN RAISE EXCEPTION 'E1 mutation matrix requires inactive owned 58122'; END $$;
\quit
\endif
BEGIN;
SET LOCAL statement_timeout='90s';
\ir ../round8/service_acceptance_release_fixes_body.psql
SET LOCAL session_replication_role=replica;
INSERT INTO auth.users(id,email,encrypted_password,email_confirmed_at,created_at,updated_at,aud,role)
SELECT pg_temp.uid(n),'rc7-e1-matrix-'||n||'@test.invalid','',now(),now(),now(),'authenticated','authenticated'
FROM generate_series(11,14) n;
INSERT INTO public.profiles(id,email,full_name,is_designer)
SELECT id,email,'E1 actor',false FROM auth.users WHERE id IN
 (pg_temp.uid(11),pg_temp.uid(12),pg_temp.uid(13),pg_temp.uid(14));
INSERT INTO public.studio_contacts(id,organization_id,entity_kind,contact_kind,company_name,company_kind) VALUES
 ('e1010000-0000-4000-8000-000000000011','f8961000-0000-4000-8000-000000000001','company','trade','GC','gc'),
 ('e1010000-0000-4000-8000-000000000012','f8961000-0000-4000-8000-000000000001','company','trade','Maker','maker'),
 ('e1010000-0000-4000-8000-000000000013','f8961000-0000-4000-8000-000000000001','company','trade','Supplier','supplier');
INSERT INTO public.studio_contacts(id,organization_id,entity_kind,contact_kind,full_name,profile_id,company_id)
SELECT ('e1020000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
 'f8961000-0000-4000-8000-000000000001','person','trade','E1 party '||n,
 pg_temp.uid(n),('e1010000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid
FROM generate_series(11,13) n;
INSERT INTO public.organization_members(user_id,organization_id,role,status) VALUES
 (pg_temp.uid(14),'f8961000-0000-4000-8000-000000000001','guest','active');
SET LOCAL session_replication_role=origin;
CREATE TEMP TABLE e1_ops(name text PRIMARY KEY, command text);
CREATE TEMP TABLE e1_outcomes(actor integer, phase text, operation text, result jsonb);
GRANT SELECT ON e1_ops TO authenticated,anon,service_role;
GRANT INSERT,SELECT ON e1_outcomes TO authenticated,anon;
CREATE FUNCTION pg_temp.probe(q text) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE value jsonb; state text; message text;
BEGIN
 BEGIN
  EXECUTE q INTO value;
  RAISE EXCEPTION 'probe_success' USING ERRCODE='P0001';
 EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS state=RETURNED_SQLSTATE,message=MESSAGE_TEXT;
  IF state='P0001' AND message='probe_success' THEN
   RETURN jsonb_build_object('ok',value);
  END IF;
  RETURN jsonb_build_object('state',state,'message',message);
 END;
END $$;
GRANT EXECUTE ON FUNCTION pg_temp.probe(text),pg_temp.actor(integer),pg_temp.assert_true(boolean,text),pg_temp.v(text)
 TO authenticated,anon,service_role;
GRANT SELECT ON sa_results TO service_role;
GRANT SELECT,UPDATE ON assertion_count TO service_role;
INSERT INTO e1_ops VALUES
 ('respond',format('SELECT public.respond_service_acceptance(%L,%L,%L::jsonb,NULL,%L,%L,%s,%L)',
 pg_temp.req('h2'),'accept','[]',
 (SELECT scope_content_hash FROM public.service_acceptance_requests WHERE id=pg_temp.req('h2')),
 (SELECT evidence_manifest_hash FROM public.service_acceptance_requests WHERE id=pg_temp.req('h2')),
 (SELECT signer_policy_revision FROM public.service_acceptance_requests WHERE id=pg_temp.req('h2')),'e1-matrix-r')),
 ('record_paper',format('SELECT public.record_service_acceptance_paper_intake(%L,%L,%L,current_date,%L,%L,%L::jsonb,NULL,%s,%L,%L,%s,%L)',
 pg_temp.req('p1'),(SELECT id FROM public.service_acceptance_signers WHERE request_id=pg_temp.req('p1') AND slot='paper_a'),
 (SELECT storage_object_id FROM public.service_acceptance_paper_intakes WHERE request_id=pg_temp.req('p1') LIMIT 1),
 'Paper','accept','[]',(SELECT request_number FROM public.service_acceptance_requests WHERE id=pg_temp.req('p1')),
 (SELECT scope_content_hash FROM public.service_acceptance_requests WHERE id=pg_temp.req('p1')),
 (SELECT evidence_manifest_hash FROM public.service_acceptance_requests WHERE id=pg_temp.req('p1')),
 (SELECT signer_policy_revision FROM public.service_acceptance_requests WHERE id=pg_temp.req('p1')),'e1-matrix-p')),
 ('review_paper',format('SELECT public.review_service_acceptance_paper_intake(%L,%L,%L,NULL,%L)',
 (pg_temp.v('pa')->>'intakeId')::uuid,'confirmed',pg_temp.v('pa')->>'documentSha256','e1-matrix-review')),
 ('present_offline',format('SELECT public.present_service_acceptance_offline(%L,%L,%L,%L)',
 pg_temp.req('h3'),(SELECT scope_content_hash FROM public.service_acceptance_requests WHERE id=pg_temp.req('h3')),
 (SELECT evidence_manifest_hash FROM public.service_acceptance_requests WHERE id=pg_temp.req('h3')),'e1-matrix-present')),
 ('replace_signer',format('SELECT public.replace_service_acceptance_signer(%L,%L,NULL,%L,%s,%L,%L)',
 pg_temp.req('h2'),(SELECT id FROM public.service_acceptance_signers WHERE request_id=pg_temp.req('h2') AND slot='co_client'),
 pg_temp.card(6),(SELECT signer_policy_revision FROM public.service_acceptance_requests WHERE id=pg_temp.req('h2')),
 'replace','e1-matrix-replace')),
 ('withdraw',format('SELECT public.withdraw_service_acceptance_request(%L,%L,%L)',pg_temp.req('h2'),'changed','e1-matrix-withdraw')),
 ('complete',format('SELECT public.complete_studio_service(%L,%L,%L,%L)',pg_temp.project(),pg_temp.req('r4'),
 (SELECT obligation_hash FROM public.studio_service_completions WHERE id=(pg_temp.v('done-dor')->>'completionId')::uuid),'e1-matrix-complete')),
 ('revoke_completion',format('SELECT public.revoke_studio_service_completion(%L,%L)',
 (pg_temp.v('done-dor')->>'completionId')::uuid,'reopened')),
 ('resolve_condition',format('SELECT public.resolve_service_acceptance_condition(%L,%L,%L,%L::jsonb,%L)',
 pg_temp.req('r4'),pg_temp.condition4(),'resolved','{}','e1-matrix-resolve')),
 ('stamp_hash',format('SELECT public.stamp_service_acceptance_paper_hash(%L,%L,%L,%L)',
 (pg_temp.v('pa')->>'intakeId')::uuid,pg_temp.v('pa')->>'documentSha256',
 (SELECT storage_object_version FROM public.service_acceptance_paper_intakes WHERE id=(pg_temp.v('pa')->>'intakeId')::uuid),
 (SELECT storage_object_etag FROM public.service_acceptance_paper_intakes WHERE id=(pg_temp.v('pa')->>'intakeId')::uuid)));
GRANT EXECUTE ON FUNCTION public.respond_service_acceptance(uuid,text,jsonb,text,text,text,integer,text,text),
 public.record_service_acceptance_paper_intake(uuid,uuid,uuid,date,text,text,jsonb,text,integer,text,text,integer,text),
 public.review_service_acceptance_paper_intake(uuid,text,text,text,text),
 public.present_service_acceptance_offline(uuid,text,text,text),
 public.replace_service_acceptance_signer(uuid,uuid,uuid,uuid,integer,text,text),
 public.withdraw_service_acceptance_request(uuid,text,text),
 public.complete_studio_service(uuid,uuid,text,text),
 public.revoke_studio_service_completion(uuid,text),
 public.resolve_service_acceptance_condition(uuid,uuid,text,jsonb,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.stamp_service_acceptance_paper_hash(uuid,text,text,text) TO service_role;
SELECT pg_temp.actor(NULL);
SET LOCAL ROLE service_role;
SELECT pg_temp.assert_true(pg_temp.probe((SELECT command FROM e1_ops WHERE name='stamp_hash'))->'ok'->>'documentSha256'
 =pg_temp.v('pa')->>'documentSha256','X02 paper hash RPC service role replays matching digest');
RESET ROLE;
-- Each probe raises inside a subtransaction after a successful RPC; no success mutates fixture state.
SELECT format('SELECT pg_temp.actor(%s); SET LOCAL ROLE %s; INSERT INTO e1_outcomes SELECT %s,%L,name,pg_temp.probe(command) FROM e1_ops; RESET ROLE;',
 COALESCE(n::text,'NULL'),CASE WHEN n IS NULL THEN 'anon' ELSE 'authenticated' END,COALESCE(n::text,'NULL'),'active')
FROM unnest(ARRAY[1,2,3,4,5,6,10,11,12,13,14,NULL::integer]) n \gexec
UPDATE public.organization_members SET status='removed' WHERE user_id=pg_temp.uid(3)
 AND organization_id='f8961000-0000-4000-8000-000000000001';
SELECT pg_temp.actor(3); SET LOCAL ROLE authenticated;
INSERT INTO e1_outcomes SELECT 3,'revoked',name,pg_temp.probe(command) FROM e1_ops;
RESET ROLE;
UPDATE public.server_capabilities SET enabled=false WHERE key='scope_editions';
REVOKE EXECUTE ON FUNCTION public.respond_service_acceptance(uuid,text,jsonb,text,text,text,integer,text,text),
 public.record_service_acceptance_paper_intake(uuid,uuid,uuid,date,text,text,jsonb,text,integer,text,text,integer,text),
 public.review_service_acceptance_paper_intake(uuid,text,text,text,text),
 public.present_service_acceptance_offline(uuid,text,text,text),
 public.replace_service_acceptance_signer(uuid,uuid,uuid,uuid,integer,text,text),
 public.withdraw_service_acceptance_request(uuid,text,text),
 public.complete_studio_service(uuid,uuid,text,text),
 public.revoke_studio_service_completion(uuid,text),
 public.resolve_service_acceptance_condition(uuid,uuid,text,jsonb,text) FROM authenticated;
SELECT format('SELECT pg_temp.actor(%s); SET LOCAL ROLE %s; INSERT INTO e1_outcomes SELECT %s,%L,name,pg_temp.probe(command) FROM e1_ops; RESET ROLE;',
 COALESCE(n::text,'NULL'),CASE WHEN n IS NULL THEN 'anon' ELSE 'authenticated' END,COALESCE(n::text,'NULL'),'inactive')
FROM unnest(ARRAY[1,2,3,4,5,6,10,11,12,13,14,NULL::integer]) n \gexec
SELECT pg_temp.assert_true((SELECT count(*)=250 FROM e1_outcomes),
 'X02 all ten mutation RPCs called in active and inactive modes for eleven authenticated actors and anon, plus removed admin');
SELECT pg_temp.assert_true(NOT EXISTS (
 SELECT 1 FROM e1_outcomes o
 CROSS JOIN LATERAL (SELECT CASE
  WHEN phase='inactive' OR actor IS NULL OR actor IN (4,10,11,12,13,14)
    OR phase='revoked' OR operation='stamp_hash' THEN '42501'
  WHEN actor IN (5,6) THEN CASE WHEN operation='respond' THEN '55000' ELSE '42501' END
  WHEN actor=1 THEN CASE operation
    WHEN 'complete' THEN '23505' WHEN 'resolve_condition' THEN '23505'
    WHEN 'revoke_completion' THEN 'ok'
    WHEN 'respond' THEN '42501' WHEN 'review_paper' THEN '42501'
    ELSE '55000' END
  WHEN actor=2 THEN CASE operation
    WHEN 'complete' THEN '23505' WHEN 'resolve_condition' THEN '23505'
    WHEN 'record_paper' THEN '55000' WHEN 'withdraw' THEN '55000'
    ELSE '42501' END
  WHEN actor=3 THEN CASE operation
    WHEN 'complete' THEN '23505' WHEN 'resolve_condition' THEN '23505'
    WHEN 'revoke_completion' THEN 'ok'
    WHEN 'respond' THEN '42501'
    ELSE '55000' END END AS wanted) e
 WHERE COALESCE(o.result->>'state', CASE WHEN o.result ? 'ok' THEN 'ok' END) IS DISTINCT FROM e.wanted),
 'X02 each mutation RPC returned its actor-specific SQLSTATE or authorized receipt');
SELECT pg_temp.assert_true((SELECT count(*)=0 FROM public.service_acceptance_requests
 WHERE client_request_id LIKE 'e1-matrix-%')
 AND (SELECT count(*)=0 FROM public.studio_service_completions WHERE client_request_id='e1-matrix-complete')
 AND (SELECT count(*)=0 FROM public.service_acceptance_responses WHERE client_request_id='e1-matrix-r'),
 'X02 probes roll back every successful mutation; refusals leave no duplicate');
DO $$ BEGIN RAISE NOTICE 'E1 C4/C6 mutation matrix: 250 actor/RPC outcomes asserted'; END $$;
ROLLBACK;
