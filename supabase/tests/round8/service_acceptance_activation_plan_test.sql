-- Owned stack only (any local port but the shared 54322); every fixture/ACL change is rolled back.
\set ON_ERROR_STOP on
SELECT :'HOST' = '127.0.0.1' AND :'PORT' <> '54322' AS owned_stack \gset
\if :owned_stack
\else
DO $$ BEGIN RAISE EXCEPTION 'C4 activation plan refused: requires an owned 127.0.0.1 stack, never the shared 54322'; END $$;
\quit
\endif
BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='60s';
CREATE TEMP TABLE assertion_count(n integer NOT NULL);
INSERT INTO assertion_count VALUES (0);
GRANT ALL ON assertion_count TO authenticated, anon;
CREATE FUNCTION pg_temp.assert_true(ok boolean, name text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'ASSERTION FAILED: %',name; END IF;
 UPDATE assertion_count SET n=n+1;
 RAISE NOTICE 'PASS: %',name;
END $$;
CREATE TEMP TABLE activation_allowlist(signature regprocedure PRIMARY KEY, role_name text);
INSERT INTO activation_allowlist VALUES
('public.create_service_acceptance_request(uuid,uuid,uuid,text)'::regprocedure,'authenticated'),
('public.respond_service_acceptance(uuid,text,jsonb,text,text,text,integer,text,text)'::regprocedure,'authenticated'),
('public.record_service_acceptance_paper_intake(uuid,uuid,uuid,date,text,text,jsonb,text,integer,text,text,integer,text)'::regprocedure,'authenticated'),
('public.review_service_acceptance_paper_intake(uuid,text,text,text,text)'::regprocedure,'authenticated'),
('public.replace_service_acceptance_signer(uuid,uuid,uuid,uuid,integer,text,text)'::regprocedure,'authenticated'),
('public.withdraw_service_acceptance_request(uuid,text,text)'::regprocedure,'authenticated'),
('public.present_service_acceptance_offline(uuid,text,text,text)'::regprocedure,'authenticated'),
('public.stamp_service_acceptance_paper_hash(uuid,text,text,text)'::regprocedure,'service_role');
CREATE TEMP TABLE shipped_acl AS SELECT p.oid,p.proacl FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.proname LIKE '%service_acceptance%';
CREATE FUNCTION pg_temp.check_acl(active boolean) RETURNS void LANGUAGE plpgsql AS $$
DECLARE f record; r text; expected boolean;
BEGIN
 PERFORM pg_temp.assert_true((SELECT count(*)=8 FROM activation_allowlist),'C4 eight exact activation signatures exist');
 FOR f IN SELECT p.* FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname LIKE '%service_acceptance%' ORDER BY p.oid LOOP
  PERFORM pg_temp.assert_true(NOT EXISTS(SELECT 1 FROM aclexplode(COALESCE(f.proacl,acldefault('f',f.proowner))) a
   WHERE a.grantee=0 AND a.privilege_type='EXECUTE'),'C4 no PUBLIC execute: '||f.oid::regprocedure);
  FOREACH r IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
   expected:=(r='authenticated' AND f.oid IN ('public.get_project_service_acceptance(uuid)'::regprocedure,
    'public.get_my_service_acceptance_requests()'::regprocedure,'public._can_access_service_acceptance_paper_object(text)'::regprocedure,
    'public.get_my_service_acceptance_evidence(uuid)'::regprocedure,'public._can_read_service_acceptance_evidence_object(text)'::regprocedure))
    OR (active AND EXISTS(SELECT 1 FROM activation_allowlist a WHERE a.signature=f.oid AND a.role_name=r));
   PERFORM pg_temp.assert_true(has_function_privilege(r,f.oid,'EXECUTE')=expected,
    'C4 ACL active='||active||' '||r||' '||f.oid::regprocedure);
  END LOOP;
 END LOOP;
END $$;
SELECT pg_temp.assert_true((SELECT count(*)>7 FROM shipped_acl),'C4 dynamic helper census is nonempty');
SELECT pg_temp.assert_true((SELECT NOT enabled FROM public.server_capabilities WHERE key='scope_editions'),'C4 shipped capability inactive');
SELECT pg_temp.check_acl(false);
-- C4 §2.8 activation plan: ACL rehearsal only, never enable the capability.
GRANT EXECUTE ON FUNCTION public.create_service_acceptance_request(uuid,uuid,uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.respond_service_acceptance(uuid,text,jsonb,text,text,text,integer,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_service_acceptance_paper_intake(uuid,uuid,uuid,date,text,text,jsonb,text,integer,text,text,integer,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.review_service_acceptance_paper_intake(uuid,text,text,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.replace_service_acceptance_signer(uuid,uuid,uuid,uuid,integer,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.withdraw_service_acceptance_request(uuid,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.present_service_acceptance_offline(uuid,text,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.stamp_service_acceptance_paper_hash(uuid,text,text,text) TO service_role;
SELECT pg_temp.check_acl(true);
-- Exact inverse from C4 §2.8.
REVOKE EXECUTE ON FUNCTION public.create_service_acceptance_request(uuid,uuid,uuid,text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.respond_service_acceptance(uuid,text,jsonb,text,text,text,integer,text,text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.record_service_acceptance_paper_intake(uuid,uuid,uuid,date,text,text,jsonb,text,integer,text,text,integer,text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.review_service_acceptance_paper_intake(uuid,text,text,text,text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.replace_service_acceptance_signer(uuid,uuid,uuid,uuid,integer,text,text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.withdraw_service_acceptance_request(uuid,text,text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.present_service_acceptance_offline(uuid,text,text,text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.stamp_service_acceptance_paper_hash(uuid,text,text,text) FROM service_role;
SELECT pg_temp.check_acl(false);
SELECT pg_temp.assert_true(NOT EXISTS(SELECT 1 FROM shipped_acl s FULL JOIN
 (SELECT p.oid,p.proacl FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.proname LIKE '%service_acceptance%') p USING(oid)
 WHERE s.oid IS NULL OR p.oid IS NULL OR s.proacl IS DISTINCT FROM p.proacl),'C4 inverse revokes restore exact shipped census');
SELECT pg_temp.assert_true((SELECT NOT enabled FROM public.server_capabilities WHERE key='scope_editions'),'C4 capability remains inactive');
RESET ROLE;
DO $$ BEGIN RAISE NOTICE 'C4 activation plan: PASS % assertions', (SELECT n FROM assertion_count); END $$;
ROLLBACK;
