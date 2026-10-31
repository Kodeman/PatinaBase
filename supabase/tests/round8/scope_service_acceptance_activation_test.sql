-- Gate for the held C2/C4 activation migrations (_pending/00907, _pending/00908).
-- Owned stack only (any local port but the shared 54322). Run from this file's
-- repo location: \ir resolves relative to the script. Everything is rolled back.
\set ON_ERROR_STOP on
SELECT :'HOST' = '127.0.0.1' AND :'PORT' <> '54322' AS owned_stack \gset
\if :owned_stack
\else
DO $$ BEGIN RAISE EXCEPTION 'C2/C4 activation gate refused: requires an owned 127.0.0.1 stack, never the shared 54322'; END $$;
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

CREATE TEMP TABLE c2_mutations(signature regprocedure PRIMARY KEY);
INSERT INTO c2_mutations VALUES
('public.apply_service_arrangement(uuid,text,uuid)'),
('public.assign_ffe_items_to_scope_package(uuid,uuid[],text,text)'),
('public.reconcile_scope_edition(uuid,uuid,uuid)');
-- C4 §2.8: the seven to authenticated, the stamp to service_role.
CREATE TEMP TABLE c4_allowlist(signature regprocedure PRIMARY KEY, role_name text NOT NULL);
INSERT INTO c4_allowlist VALUES
('public.create_service_acceptance_request(uuid,uuid,uuid,text)','authenticated'),
('public.respond_service_acceptance(uuid,text,jsonb,text,text,text,integer,text,text)','authenticated'),
('public.record_service_acceptance_paper_intake(uuid,uuid,uuid,date,text,text,jsonb,text,integer,text,text,integer,text)','authenticated'),
('public.review_service_acceptance_paper_intake(uuid,text,text,text,text)','authenticated'),
('public.replace_service_acceptance_signer(uuid,uuid,uuid,uuid,integer,text,text)','authenticated'),
('public.withdraw_service_acceptance_request(uuid,text,text)','authenticated'),
('public.present_service_acceptance_offline(uuid,text,text,text)','authenticated'),
('public.stamp_service_acceptance_paper_hash(uuid,text,text,text)','service_role');
-- Dependents that stay ungranted after C2 + C4 (C5 five, C6 three, C3 direct route).
CREATE TEMP TABLE still_inactive(signature regprocedure PRIMARY KEY);
INSERT INTO still_inactive VALUES
('public.complete_studio_service(uuid,uuid,text,text)'),
('public.resolve_service_acceptance_condition(uuid,uuid,text,jsonb,text)'),
('public.revoke_studio_service_completion(uuid,text)'),
('public.create_external_fulfilment(uuid,uuid,text,text,text[],uuid,uuid,text)'),
('public.record_external_fulfilment_event(uuid,text,jsonb,text[],text)'),
('public.verify_external_fulfilment_event(uuid,text)'),
('public.set_ffe_item_external_fulfilment(uuid,uuid,bigint,text)'),
('public.bind_fulfilment_evidence(uuid,uuid,text[],text)'),
('public.record_fabrication_instruction(uuid,uuid,uuid,text[],jsonb,uuid)');
-- C4 reads and storage predicates granted by 00886/00889.
CREATE TEMP TABLE c4_reads(signature regprocedure PRIMARY KEY);
INSERT INTO c4_reads VALUES
('public.get_project_service_acceptance(uuid)'),
('public.get_my_service_acceptance_requests()'),
('public.get_my_service_acceptance_evidence(uuid)'),
('public._can_access_service_acceptance_paper_object(text)'),
('public._can_read_service_acceptance_evidence_object(text)');

CREATE FUNCTION pg_temp.check_c4_acl(active boolean) RETURNS void LANGUAGE plpgsql AS $$
DECLARE f record; r text; expected boolean;
BEGIN
 FOR f IN SELECT p.* FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname LIKE '%service_acceptance%' ORDER BY p.oid LOOP
  PERFORM pg_temp.assert_true(NOT EXISTS(SELECT 1 FROM aclexplode(COALESCE(f.proacl, acldefault('f', f.proowner))) a
   WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE'), 'no PUBLIC execute: ' || f.oid::regprocedure);
  FOREACH r IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
   CONTINUE WHEN f.oid IN (SELECT signature FROM still_inactive);
   expected := (r = 'authenticated' AND f.oid IN (SELECT signature FROM c4_reads))
    OR (active AND EXISTS(SELECT 1 FROM c4_allowlist a WHERE a.signature = f.oid AND a.role_name = r));
   PERFORM pg_temp.assert_true(has_function_privilege(r, f.oid, 'EXECUTE') = expected,
    'C4 ACL active=' || active || ' ' || r || ' ' || f.oid::regprocedure);
  END LOOP;
 END LOOP;
END $$;

-- Whole-schema ACL snapshot: activation may change exactly the expected grants.
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
CREATE TEMP TABLE acl_before AS SELECT * FROM pg_temp.public_acls();
CREATE TEMP TABLE caps_before AS SELECT key, enabled FROM public.server_capabilities;

-- 1. Shipped state.
SELECT pg_temp.assert_true((SELECT NOT enabled FROM public.server_capabilities WHERE key = 'scope_editions'), 'shipped: scope_editions off');
SELECT pg_temp.assert_true(NOT has_function_privilege('authenticated', signature, 'EXECUTE'), 'shipped: C2 ungranted ' || signature) FROM c2_mutations;
SELECT pg_temp.check_c4_acl(false);

-- 2. C4 before C2 refuses, and leaves nothing granted.
SAVEPOINT c4_first;
\set ON_ERROR_STOP off
\ir ../../migrations/_pending/00908_round8_c4_service_acceptance_activation.sql
\set ON_ERROR_STOP on
ROLLBACK TO SAVEPOINT c4_first;
SELECT :'LAST_ERROR_MESSAGE' = 'C4 activation refused: apply the C2 activation (scope_editions on, C2 grants) first' AS c4_refused \gset
SELECT pg_temp.assert_true(:'c4_refused'::boolean, 'C4 before C2 refuses with the ordering message');
SELECT pg_temp.check_c4_acl(false);

-- 3. C2 activation.
\ir ../../migrations/_pending/00907_round8_c2_scope_editions_activation.sql
SELECT pg_temp.assert_true((SELECT enabled FROM public.server_capabilities WHERE key = 'scope_editions'), 'C2: scope_editions on');
SELECT pg_temp.assert_true(has_function_privilege('authenticated', signature, 'EXECUTE')
  AND NOT has_function_privilege('anon', signature, 'EXECUTE'), 'C2: authenticated only ' || signature) FROM c2_mutations;
SELECT pg_temp.assert_true((SELECT enabled FROM public.server_capabilities WHERE key = 'margin_note_escalation') IS NOT TRUE, 'C2: margin_note_escalation untouched');
SELECT pg_temp.check_c4_acl(false);

-- 4. C4 activation.
\ir ../../migrations/_pending/00908_round8_c4_service_acceptance_activation.sql
SELECT pg_temp.check_c4_acl(true);
SELECT pg_temp.assert_true(NOT has_function_privilege(r, signature, 'EXECUTE'), 'still inactive for ' || r || ': ' || signature)
  FROM still_inactive, unnest(ARRAY['anon','authenticated']) r;

-- 4b. Nothing else changed: added privileges are exactly the eleven grants, none removed.
CREATE TEMP TABLE acl_after AS SELECT * FROM pg_temp.public_acls();
CREATE TEMP TABLE expected_added AS
 SELECT signature::oid AS oid, 'authenticated'::regrole::oid AS grantee FROM c2_mutations
 UNION ALL SELECT signature::oid, role_name::regrole::oid FROM c4_allowlist;
SELECT pg_temp.assert_true(NOT EXISTS (
  (SELECT oid, grantee FROM (SELECT * FROM acl_after EXCEPT SELECT * FROM acl_before) added WHERE privilege = 'EXECUTE')
  EXCEPT SELECT oid, grantee FROM expected_added), 'ACL diff: no unexpected EXECUTE grant');
SELECT pg_temp.assert_true(NOT EXISTS (
  SELECT 1 FROM (SELECT * FROM acl_after EXCEPT SELECT * FROM acl_before) added WHERE privilege <> 'EXECUTE'), 'ACL diff: no table or other privilege added');
SELECT pg_temp.assert_true((SELECT count(*) FROM (SELECT * FROM acl_after EXCEPT SELECT * FROM acl_before) added) = 11, 'ACL diff: exactly eleven grants added');
SELECT pg_temp.assert_true(NOT EXISTS (SELECT * FROM acl_before EXCEPT SELECT * FROM acl_after), 'ACL diff: nothing revoked');
SELECT pg_temp.assert_true((SELECT count(*) FROM acl_before WHERE kind = 'f') > 0 AND (SELECT count(*) FROM acl_before WHERE kind = 'r') > 0, 'ACL snapshot is nonempty');
SELECT pg_temp.assert_true(NOT EXISTS (
  SELECT key, enabled FROM public.server_capabilities EXCEPT SELECT key, enabled FROM caps_before WHERE key <> 'scope_editions'
  EXCEPT SELECT 'scope_editions', true), 'capabilities: only scope_editions changed');

-- 5. Re-running both is a no-op.
\ir ../../migrations/_pending/00907_round8_c2_scope_editions_activation.sql
\ir ../../migrations/_pending/00908_round8_c4_service_acceptance_activation.sql
SELECT pg_temp.check_c4_acl(true);

DO $$ BEGIN RAISE NOTICE 'C2/C4 activation gate: PASS % assertions', (SELECT n FROM assertion_count); END $$;
ROLLBACK;
