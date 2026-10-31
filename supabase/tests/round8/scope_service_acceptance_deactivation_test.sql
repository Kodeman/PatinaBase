-- Gate for the held deactivation migration (_pending/00909), the rollback for
-- the held C2/C4 activations (_pending/00907, _pending/00908). Owned stack only
-- (any local port but the shared 54322). Run from this file's repo location:
-- \ir resolves relative to the script. Everything is rolled back.
\set ON_ERROR_STOP on
SELECT :'HOST' = '127.0.0.1' AND :'PORT' <> '54322' AS owned_stack \gset
\if :owned_stack
\else
DO $$ BEGIN RAISE EXCEPTION 'Deactivation gate refused: requires an owned 127.0.0.1 stack, never the shared 54322'; END $$;
\quit
\endif
BEGIN;
SET LOCAL statement_timeout = '60s';
CREATE TEMP TABLE assertion_count(n integer NOT NULL);
INSERT INTO assertion_count VALUES (0);
CREATE FUNCTION pg_temp.assert_true(ok boolean, name text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'ASSERTION FAILED: %', name; END IF;
 UPDATE assertion_count SET n = n + 1;
 RAISE NOTICE 'PASS: %', name;
END $$;

CREATE FUNCTION pg_temp.public_acls() RETURNS TABLE(kind text, oid oid, name text, grantee oid, privilege text)
LANGUAGE sql STABLE AS $$
 SELECT 'f', p.oid, p.oid::regprocedure::text, a.grantee, a.privilege_type
 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace,
      aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) a WHERE n.nspname = 'public'
 UNION ALL
 SELECT 'r', c.oid, c.oid::regclass::text, a.grantee, a.privilege_type
 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace,
      aclexplode(COALESCE(c.relacl, acldefault((CASE WHEN c.relkind = 'S' THEN 's' ELSE 'r' END)::"char", c.relowner))) a
 WHERE n.nspname = 'public'
$$;
-- The C2 three stay granted after deactivation (C2 §2.8): they self-refuse.
CREATE TEMP TABLE c2_kept(signature regprocedure PRIMARY KEY);
INSERT INTO c2_kept VALUES
('public.apply_service_arrangement(uuid,text,uuid)'),
('public.assign_ffe_items_to_scope_package(uuid,uuid[],text,text)'),
('public.reconcile_scope_edition(uuid,uuid,uuid)');
-- Every dependent mutation the deactivation must leave unexecutable.
CREATE TEMP TABLE paused(signature regprocedure PRIMARY KEY, role_name text NOT NULL);
INSERT INTO paused VALUES
('public.create_service_acceptance_request(uuid,uuid,uuid,text)','authenticated'),
('public.respond_service_acceptance(uuid,text,jsonb,text,text,text,integer,text,text)','authenticated'),
('public.record_service_acceptance_paper_intake(uuid,uuid,uuid,date,text,text,jsonb,text,integer,text,text,integer,text)','authenticated'),
('public.review_service_acceptance_paper_intake(uuid,text,text,text,text)','authenticated'),
('public.replace_service_acceptance_signer(uuid,uuid,uuid,uuid,integer,text,text)','authenticated'),
('public.withdraw_service_acceptance_request(uuid,text,text)','authenticated'),
('public.present_service_acceptance_offline(uuid,text,text,text)','authenticated'),
('public.stamp_service_acceptance_paper_hash(uuid,text,text,text)','service_role'),
('public.complete_studio_service(uuid,uuid,text,text)','authenticated'),
('public.resolve_service_acceptance_condition(uuid,uuid,text,jsonb,text)','authenticated'),
('public.revoke_studio_service_completion(uuid,text)','authenticated'),
('public.create_external_fulfilment(uuid,uuid,text,text,text[],uuid,uuid,text)','authenticated'),
('public.record_external_fulfilment_event(uuid,text,jsonb,text[],text)','authenticated'),
('public.verify_external_fulfilment_event(uuid,text)','authenticated'),
('public.set_ffe_item_external_fulfilment(uuid,uuid,bigint,text)','authenticated'),
('public.bind_fulfilment_evidence(uuid,uuid,text[],text)','authenticated'),
('public.record_fabrication_instruction(uuid,uuid,uuid,text[],jsonb,uuid)','authenticated');
-- Reads and storage predicates that must stay granted throughout.
CREATE TEMP TABLE kept_reads(signature regprocedure PRIMARY KEY);
INSERT INTO kept_reads VALUES
('public.get_project_scope_editions(uuid)'),
('public.get_project_service_acceptance(uuid)'),
('public.get_my_service_acceptance_requests()'),
('public.get_my_service_acceptance_evidence(uuid)'),
('public._can_access_service_acceptance_paper_object(text)'),
('public._can_read_service_acceptance_evidence_object(text)');

CREATE TEMP TABLE acl_shipped AS SELECT * FROM pg_temp.public_acls();
CREATE TEMP TABLE caps_shipped AS SELECT key, enabled FROM public.server_capabilities;

CREATE FUNCTION pg_temp.check_deactivated(label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 PERFORM pg_temp.assert_true((SELECT enabled FROM public.server_capabilities WHERE key = 'scope_editions') IS FALSE, label || ': scope_editions off');
 PERFORM pg_temp.assert_true(NOT EXISTS (SELECT key, enabled FROM public.server_capabilities EXCEPT SELECT key, enabled FROM caps_shipped),
  label || ': capabilities back to shipped');
 PERFORM pg_temp.assert_true(NOT has_function_privilege(p.role_name, p.signature, 'EXECUTE'), label || ': paused ' || p.signature)
 FROM paused p;
 PERFORM pg_temp.assert_true(has_function_privilege('authenticated', r.signature, 'EXECUTE'), label || ': read kept ' || r.signature)
 FROM kept_reads r;
 -- Against the shipped ACLs: nothing revoked, and the only additions are the C2 three kept on purpose.
 PERFORM pg_temp.assert_true(NOT EXISTS (SELECT * FROM acl_shipped EXCEPT SELECT * FROM pg_temp.public_acls()), label || ': nothing below shipped');
 PERFORM pg_temp.assert_true(NOT EXISTS (
   SELECT oid, grantee, privilege FROM (SELECT * FROM pg_temp.public_acls() EXCEPT SELECT * FROM acl_shipped) added
   EXCEPT SELECT signature::oid, 'authenticated'::regrole::oid, 'EXECUTE' FROM c2_kept), label || ': only the C2 three remain added');
END $$;
CREATE FUNCTION pg_temp.check_c2_kept(label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 PERFORM pg_temp.assert_true(has_function_privilege('authenticated', k.signature, 'EXECUTE'), label || ': C2 kept ' || k.signature)
 FROM c2_kept k;
END $$;

-- 1. Deactivating a never-activated stack is a no-op.
SAVEPOINT never_active;
\ir ../../migrations/_pending/00909_round8_c2_c4_deactivation.sql
SELECT pg_temp.assert_true(NOT EXISTS (SELECT * FROM pg_temp.public_acls() EXCEPT SELECT * FROM acl_shipped)
  AND NOT EXISTS (SELECT * FROM acl_shipped EXCEPT SELECT * FROM pg_temp.public_acls()), 'never active: ACLs unchanged');
SELECT pg_temp.check_deactivated('never active');
ROLLBACK TO SAVEPOINT never_active;

-- 2. Activate C2 + C4, then simulate C6/C5/C3 grants so the revoke list is exercised.
\ir ../../migrations/_pending/00907_round8_c2_scope_editions_activation.sql
\ir ../../migrations/_pending/00908_round8_c4_service_acceptance_activation.sql
GRANT EXECUTE ON FUNCTION public.complete_studio_service(uuid,uuid,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_service_acceptance_condition(uuid,uuid,text,jsonb,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_studio_service_completion(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_external_fulfilment(uuid,uuid,text,text,text[],uuid,uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_external_fulfilment_event(uuid,text,jsonb,text[],text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.verify_external_fulfilment_event(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_ffe_item_external_fulfilment(uuid,uuid,bigint,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bind_fulfilment_evidence(uuid,uuid,text[],text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_fabrication_instruction(uuid,uuid,uuid,text[],jsonb,uuid) TO authenticated;
SELECT pg_temp.assert_true((SELECT enabled FROM public.server_capabilities WHERE key = 'scope_editions'), 'active: scope_editions on');
SELECT pg_temp.assert_true(has_function_privilege(p.role_name, p.signature, 'EXECUTE'), 'active: granted ' || p.signature) FROM paused p;

-- 3. Deactivate.
\ir ../../migrations/_pending/00909_round8_c2_c4_deactivation.sql
SELECT pg_temp.check_deactivated('deactivated');
SELECT pg_temp.check_c2_kept('deactivated');

-- 4. Re-running is a no-op.
\ir ../../migrations/_pending/00909_round8_c2_c4_deactivation.sql
SELECT pg_temp.check_deactivated('re-run');
SELECT pg_temp.check_c2_kept('re-run');

-- 5. Reactivation re-grants exactly C2 + C4 again (C5/C6/C3 stay off).
\ir ../../migrations/_pending/00907_round8_c2_scope_editions_activation.sql
\ir ../../migrations/_pending/00908_round8_c4_service_acceptance_activation.sql
SELECT pg_temp.assert_true((SELECT enabled FROM public.server_capabilities WHERE key = 'scope_editions'), 'reactivated: scope_editions on');
SELECT pg_temp.assert_true(has_function_privilege(p.role_name, p.signature, 'EXECUTE') =
  (p.signature::text LIKE '%service_acceptance%' AND p.signature::text NOT LIKE '%resolve_service_acceptance_condition%'),
  'reactivated: only C4 back ' || p.signature) FROM paused p;

DO $$ BEGIN RAISE NOTICE 'Deactivation gate: PASS % assertions', (SELECT n FROM assertion_count); END $$;
ROLLBACK;
