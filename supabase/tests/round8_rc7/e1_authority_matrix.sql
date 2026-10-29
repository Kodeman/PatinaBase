\set ON_ERROR_STOP on
\set expected_port 58122
SELECT :'HOST'='127.0.0.1' AND :'PORT'=:'expected_port' AND
  (SELECT NOT enabled FROM public.server_capabilities WHERE key='scope_editions') AS owned_stack \gset
\if :owned_stack
\else
DO $$ BEGIN RAISE EXCEPTION 'E1 requires the inactive, owned 127.0.0.1:58122 stack'; END $$;
\quit
\endif
BEGIN;
SET LOCAL statement_timeout='90s';
SET LOCAL lock_timeout='3s';
SELECT NOT has_function_privilege('authenticated',
 'public.create_service_acceptance_request(uuid,uuid,uuid,text)','EXECUTE')
 AND NOT has_function_privilege('authenticated',
 'public.complete_studio_service(uuid,uuid,text,text)','EXECUTE') AS inactive_mutations_closed \gset
\if :inactive_mutations_closed
\else
DO $$ BEGIN RAISE EXCEPTION 'X02 inactive C4/C6 mutations have executable grants'; END $$;
\endif
-- Native C2/C4/C6 transitions, including the offline evidence and completion paths.
-- The upstream fixture is read-only; all activation, grants, and data roll back.
\ir ../round8/service_acceptance_release_fixes_body.psql
GRANT EXECUTE ON FUNCTION pg_temp.project(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_studio_service(uuid,uuid,text,text),
 public.respond_service_acceptance(uuid,text,jsonb,text,text,text,integer,text,text),
 public.create_service_acceptance_request(uuid,uuid,uuid,text) TO authenticated;
CREATE TEMP TABLE e1_retry_args AS SELECT c.acceptance_request_id,c.obligation_hash,
 pg_temp.ed() AS edition_id,r.id AS request_id,r.scope_content_hash,r.evidence_manifest_hash,r.signer_policy_revision
 FROM public.studio_service_completions c CROSS JOIN public.service_acceptance_requests r
 WHERE c.id=(pg_temp.v('done-dor')->>'completionId')::uuid AND r.id=pg_temp.req('r4');
GRANT SELECT ON e1_retry_args TO authenticated;
CREATE TEMP TABLE e1_retry_receipts(kind text, receipt jsonb);
GRANT INSERT ON e1_retry_receipts TO authenticated;
SELECT pg_temp.assert_true((SELECT count(*)=1 AND bool_and(completed_by=pg_temp.uid(2)
 AND client_request_id='rf-done-dor' AND obligation_hash IS NOT NULL AND length(request_hash)=64)
 FROM public.studio_service_completions WHERE id=(pg_temp.v('done-dor')->>'completionId')::uuid),
 'X09 completion has one actor-bound, obligation-hashed audit row');
SELECT pg_temp.actor(2);
SET LOCAL ROLE authenticated;
INSERT INTO e1_retry_receipts SELECT 'completion',public.complete_studio_service(pg_temp.project(),
 acceptance_request_id,obligation_hash,'rf-done-dor') FROM e1_retry_args;
RESET ROLE;
SELECT pg_temp.assert_true((SELECT (receipt->>'replayed')::boolean FROM e1_retry_receipts WHERE kind='completion')
 AND (SELECT count(*)=1 FROM public.studio_service_completions
 WHERE client_request_id='rf-done-dor' AND project_id=pg_temp.project()),
 'X09 authenticated C6 completion retry returns receipt without duplicate');
SELECT pg_temp.actor(5);
SET LOCAL ROLE authenticated;
INSERT INTO e1_retry_receipts SELECT 'response',public.respond_service_acceptance(request_id,
 'accept_with_conditions','[{"text":"Touch up the paint"}]'::jsonb,NULL,scope_content_hash,
 evidence_manifest_hash,signer_policy_revision,'rf-r4-5') FROM e1_retry_args;
RESET ROLE;
SELECT pg_temp.assert_true((SELECT (receipt->>'replayed')::boolean FROM e1_retry_receipts WHERE kind='response')
 AND (SELECT count(*)=1 AND bool_and(responder_profile_id=pg_temp.uid(5)
 AND presented_scope_content_hash IS NOT NULL AND length(request_hash)=64)
 FROM public.service_acceptance_responses WHERE request_id=pg_temp.req('r4') AND client_request_id='rf-r4-5'),
 'X09 authenticated signer response retry preserves one actor-bound scope-hashed response');
SELECT pg_temp.actor(1);
SELECT pg_temp.assert_true((SELECT count(*)=2 AND bool_and(recorded_by=pg_temp.uid(1)
 AND presented_scope_content_hash IS NOT NULL AND length(request_hash)=64
 AND length(document_sha256)=64) FROM public.service_acceptance_paper_intakes
 WHERE request_id=pg_temp.req('p1')),
 'X09 reviewed paper intake binds actor, content hash and SHA-256 through the hash RPC');

-- Attach three real profiles to GC, maker and supplier party cards; none joins the studio.
SET LOCAL session_replication_role=replica;
INSERT INTO auth.users(id,email,encrypted_password,email_confirmed_at,created_at,updated_at,aud,role)
SELECT pg_temp.uid(n),'rc7-e1-'||n||'@test.invalid','',now(),now(),now(),'authenticated','authenticated'
FROM generate_series(11,13) n;
INSERT INTO public.profiles(id,email,full_name,is_designer)
SELECT id,email,'E1 external party',false FROM auth.users WHERE id IN
 (pg_temp.uid(11),pg_temp.uid(12),pg_temp.uid(13));
INSERT INTO public.studio_contacts(id,organization_id,entity_kind,contact_kind,company_name,company_kind) VALUES
 ('e1010000-0000-4000-8000-000000000011','f8961000-0000-4000-8000-000000000001','company','trade','GC','gc'),
 ('e1010000-0000-4000-8000-000000000012','f8961000-0000-4000-8000-000000000001','company','trade','Maker','maker'),
 ('e1010000-0000-4000-8000-000000000013','f8961000-0000-4000-8000-000000000001','company','trade','Supplier','supplier');
INSERT INTO public.studio_contacts(id,organization_id,entity_kind,contact_kind,full_name,profile_id,company_id)
SELECT ('e1020000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
 'f8961000-0000-4000-8000-000000000001','person','trade','E1 party '||n,
 pg_temp.uid(n),('e1010000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid
FROM generate_series(11,13) n;
SET LOCAL session_replication_role=origin;

-- Test both buckets as actual authenticated RLS readers, not through a definer helper.
SET LOCAL session_replication_role=replica;
INSERT INTO storage.objects(id,bucket_id,name,owner_id,metadata) VALUES
 ('e1000000-0000-4000-8000-000000000001','service-acceptance-paper',
  pg_temp.project()::text||'/e1000000-0000-4000-8000-000000000001.pdf',pg_temp.uid(1)::text,'{"mimetype":"application/pdf"}'),
 ('e1000000-0000-4000-8000-000000000002','project-documents',
  pg_temp.project()::text||'/rc7-e1.pdf',pg_temp.uid(1)::text,'{"mimetype":"application/pdf"}'),
 ('e1000000-0000-4000-8000-000000000003','project-documents',
  'fulfillment/rc7-e1.pdf',pg_temp.uid(1)::text,'{"mimetype":"application/pdf"}');
SET LOCAL session_replication_role=origin;
SELECT pg_temp.actor(1);
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert_true(
 (SELECT count(*) FROM storage.objects WHERE id::text LIKE 'e1000000-%')=2,
 'X02 owner reads paper and valid project object but not malformed 00892 folder');
SELECT pg_temp.assert_true((public.get_project_service_acceptance(pg_temp.project())->>'capability')='active'
 AND (public.get_studio_service_completion(pg_temp.project())->>'audience')='studio',
 'X02 owner reads activated C4 and C6');
SELECT pg_temp.expect_error(format('SELECT id FROM public.service_acceptance_requests WHERE project_id=%L',pg_temp.project()),
 '42501',NULL,'X02 owner has no raw acceptance table SELECT privilege');
RESET ROLE;

SELECT pg_temp.actor(2);
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert_true((SELECT count(*) FROM storage.objects WHERE id::text LIKE 'e1000000-%')=2,
 'X02 active member reads paper and valid project object, malformed hidden');
SELECT pg_temp.assert_true((public.get_project_service_acceptance(pg_temp.project())->>'capability')='active'
 AND (public.get_studio_service_completion(pg_temp.project())->>'audience')='studio',
 'X02 active member reads C4/C6 studio projections');
RESET ROLE;

SELECT pg_temp.actor(3);
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert_true((SELECT count(*) FROM storage.objects WHERE id::text LIKE 'e1000000-%')=2,
 'X02 active admin reads paper and valid project object, malformed hidden');
SELECT pg_temp.assert_true((public.get_project_service_acceptance(pg_temp.project())->>'capability')='active'
 AND (public.get_studio_service_completion(pg_temp.project())->>'audience')='studio',
 'X02 active admin reads C4/C6 studio projections');
RESET ROLE;

SELECT pg_temp.actor(4);
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert_true((SELECT count(*) FROM storage.objects WHERE id::text LIKE 'e1000000-%')=0,
 'X02 other studio owner sees no attachment objects');
SELECT pg_temp.expect_error(format('SELECT public.get_project_service_acceptance(%L)',pg_temp.project()),
 '42501','insufficient_privilege','X02 other studio owner cannot read C4');
SELECT pg_temp.expect_error(format('SELECT public.get_studio_service_completion(%L)',pg_temp.project()),
 '42501','insufficient_privilege','X02 other studio owner cannot read C6');
RESET ROLE;

SELECT pg_temp.actor(11);
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert_true((SELECT count(*) FROM storage.objects WHERE id::text LIKE 'e1000000-%')=0
 AND public.get_my_service_acceptance_requests()='[]'::jsonb,
 'X02 GC party cannot read acceptance list or private bytes');
SELECT pg_temp.expect_error(format('SELECT public.get_studio_service_completion(%L)',pg_temp.project()),
 '42501','insufficient_privilege','X02 GC party cannot read C6');
RESET ROLE;
SELECT pg_temp.actor(12);
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert_true((SELECT count(*) FROM storage.objects WHERE id::text LIKE 'e1000000-%')=0
 AND public.get_my_service_acceptance_requests()='[]'::jsonb,
 'X02 maker party cannot read acceptance list or private bytes');
SELECT pg_temp.expect_error(format('SELECT public.get_studio_service_completion(%L)',pg_temp.project()),
 '42501','insufficient_privilege','X02 maker party cannot read C6');
RESET ROLE;
SELECT pg_temp.actor(13);
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert_true((SELECT count(*) FROM storage.objects WHERE id::text LIKE 'e1000000-%')=0
 AND public.get_my_service_acceptance_requests()='[]'::jsonb,
 'X02 supplier party cannot read acceptance list or private bytes');
SELECT pg_temp.expect_error(format('SELECT public.get_studio_service_completion(%L)',pg_temp.project()),
 '42501','insufficient_privilege','X02 supplier party cannot read C6');
RESET ROLE;

SELECT pg_temp.actor(5);
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert_true((SELECT count(*) FROM storage.objects WHERE id::text LIKE 'e1000000-%')=0,
 'X02 household client cannot read private paper, unflagged document or malformed object');
SELECT pg_temp.assert_true((public.get_studio_service_completion(pg_temp.project())->>'audience')='client'
 AND (pg_temp.listed(pg_temp.req('r4'))->>'count')::int=1,
 'X02 client reads client completion and signer acceptance list');
SELECT pg_temp.expect_error(format('SELECT public.get_project_service_acceptance(%L)',pg_temp.project()),
 '42501','insufficient_privilege','X02 client cannot read studio C4 projection');
RESET ROLE;

-- RC7-E1-1: this older-request signer is NOT on r4; the C6 predicate admits
-- any current sent-request signer on the project. Privacy ruling required.
SELECT pg_temp.actor(8);
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert_true((SELECT count(*) FROM storage.objects WHERE id::text LIKE 'e1000000-%')=0
 AND (pg_temp.listed(pg_temp.req('r4'))->>'count')::int=0,
 'X02 linked but nonsigner household member has no bytes or acceptance list');
-- DEFECT RC7-E1-1: positive cross-request C6 result is excluded from passing
-- authority gates; e1_household_privacy_defect.sql asserts the desired denial.
RESET ROLE;

SELECT pg_temp.actor(10);
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert_true((SELECT count(*) FROM storage.objects WHERE id::text LIKE 'e1000000-%')=0
 AND (pg_temp.listed(pg_temp.req('r4'))->>'count')::int=0,
 'X02 unlinked contact has no bytes or C4 list');
RESET ROLE;

-- Same authenticated DELETE-by-id used by useRemoveMember; not a privileged status edit.
CREATE TEMP TABLE e1_removed_members(id uuid);
GRANT INSERT ON e1_removed_members TO authenticated;
SELECT pg_temp.actor(1);
SET LOCAL ROLE authenticated;
WITH removed AS (DELETE FROM public.organization_members WHERE id=(
 SELECT id FROM public.organization_members WHERE user_id=pg_temp.uid(3)
 AND organization_id='f8961000-0000-4000-8000-000000000001') RETURNING id)
INSERT INTO e1_removed_members SELECT id FROM removed;
RESET ROLE;
SELECT pg_temp.assert_true((SELECT count(*)=1 FROM e1_removed_members),
 'X02 studio owner removed the admin through authenticated member DELETE');
SELECT pg_temp.actor(3);
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert_true((SELECT count(*) FROM storage.objects WHERE id::text LIKE 'e1000000-%')=0,
 'X02 revoked admin loses both attachment reads');
SELECT pg_temp.expect_error(format('SELECT public.get_project_service_acceptance(%L)',pg_temp.project()),
 '42501','insufficient_privilege','X02 revoked admin loses studio C4 read');
RESET ROLE;

SELECT pg_temp.actor(NULL);
SET LOCAL ROLE anon;
SELECT count(*)=0 AS anon_no_objects FROM storage.objects WHERE id::text LIKE 'e1000000-%' \gset
\if :anon_no_objects
\else
DO $$ BEGIN RAISE EXCEPTION 'X02 anon saw acceptance objects'; END $$;
\endif
RESET ROLE;
SELECT pg_temp.assert_true((SELECT count(*)=3 FROM storage.objects WHERE id::text LIKE 'e1000000-%'),
 'X02 superuser readback: two valid objects and one malformed survive refusals');
UPDATE public.server_capabilities SET enabled=false WHERE key='scope_editions';
SELECT pg_temp.actor(1);
SET LOCAL ROLE authenticated;
SELECT pg_temp.expect_error(format('SELECT public.create_service_acceptance_request(%L,%L,%L,%L)',
 pg_temp.project(),(SELECT edition_id FROM e1_retry_args),'f8968000-0000-4000-8000-000000000001','e1-inactive'),
 '55000','scope_editions_inactive','X02 inactive authenticated C4 create refuses inside the body');
SELECT pg_temp.expect_error(format('SELECT public.complete_studio_service(%L,%L,%L,%L)',
 pg_temp.project(),pg_temp.req('r4'),repeat('a',64),'e1-inactive-completion'),
 '55000','scope_editions_inactive','X02 inactive authenticated C6 complete refuses inside the body');
RESET ROLE;
SELECT pg_temp.assert_true((public.get_project_service_acceptance(pg_temp.project())->>'capability')='inactive'
 AND (public.get_studio_service_completion(pg_temp.project())->>'capability')='inactive'
 AND NOT EXISTS(SELECT 1 FROM public.service_acceptance_requests WHERE client_request_id='e1-inactive')
 AND NOT EXISTS(SELECT 1 FROM public.studio_service_completions WHERE client_request_id='e1-inactive-completion'),
 'X02 inactive readers report the gate; refused mutations wrote no row');
DO $$ BEGIN RAISE NOTICE 'E1 X02/X09: % assertions passed', (SELECT n FROM assertion_count); END $$;
ROLLBACK;
