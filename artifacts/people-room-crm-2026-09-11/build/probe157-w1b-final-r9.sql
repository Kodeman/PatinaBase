\pset pager off
BEGIN;
CREATE OR REPLACE FUNCTION pg_temp.assume_user(p uuid) RETURNS void AS $$
BEGIN PERFORM set_config('role','authenticated',true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub',p::text,'role','authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated'; END; $$ LANGUAGE plpgsql;
CREATE OR REPLACE FUNCTION pg_temp.reset_role() RETURNS void AS $$
BEGIN EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims',NULL,true); END; $$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION pg_temp.assume_user(uuid) TO PUBLIC;
GRANT EXECUTE ON FUNCTION pg_temp.reset_role() TO PUBLIC;
INSERT INTO organization_members (user_id, organization_id, role, status, joined_at)
VALUES ('a0000000-0000-0000-0000-000000000005','76db060f-0654-4502-94b1-00000c4e8dd3','member','active',now())
ON CONFLICT (user_id, organization_id) DO UPDATE SET role='member', status='active';

-- a plan transmittal + its link, on the STUDIO-LESS project "Aspen Loft Refresh"
INSERT INTO plan_issues (id, project_id, issue_number, name, idempotency_key, request_hash, set_checksum, sheet_count, created_by)
VALUES ('ae000000-0000-4000-8000-000000000001','b0000000-0000-0000-0000-0000000000d1',1,'Probe issue','probe-157',repeat('e',64),repeat('f',64),2,'a0000000-0000-0000-0000-000000000004');
INSERT INTO plan_transmittals (id, project_id, issue_id, party_display_name, purpose, created_by)
VALUES ('ae000000-0000-4000-8000-000000000002','b0000000-0000-0000-0000-0000000000d1','ae000000-0000-4000-8000-000000000001','Probe GC','pricing','a0000000-0000-0000-0000-000000000004');
INSERT INTO plan_transmittal_tokens (id, transmittal_id, project_id, token_hash, created_by, first_opened_at)
VALUES ('ae000000-0000-4000-8000-000000000003','ae000000-0000-4000-8000-000000000002','b0000000-0000-0000-0000-0000000000d1', repeat('d',64),'a0000000-0000-0000-0000-000000000004', now()-interval '1 day');

\echo '=== Z (designer''s SECOND design studio only) reads the plan-transmittal grant ledger ==='
SELECT pg_temp.assume_user('a0000000-0000-0000-0000-000000000005');
SELECT grant_id, tier, scope_id, granted_by, expires_at::date, last_used_at FROM public.access_grants_plan_transmittals();
\echo '-- and the withheld columns: created_by / updated_at are NOT in 00429''s column grant'
SELECT 'Z direct column read of created_by' q,
       (SELECT count(*)::text FROM public.plan_transmittal_tokens) v;
SELECT pg_temp.reset_role();
DO $$ BEGIN
  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000005');
  BEGIN PERFORM created_by FROM public.plan_transmittal_tokens LIMIT 1;
    RAISE NOTICE 'Z reads plan_transmittal_tokens.created_by DIRECTLY: yes';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'Z reads plan_transmittal_tokens.created_by DIRECTLY: permission denied';
  END;
  BEGIN PERFORM token_hash FROM public.plan_transmittal_tokens LIMIT 1;
    RAISE NOTICE 'Z reads plan_transmittal_tokens.token_hash DIRECTLY: yes';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'Z reads plan_transmittal_tokens.token_hash DIRECTLY: permission denied';
  END;
  BEGIN PERFORM created_by FROM public.trade_rfq_tokens LIMIT 1;
    RAISE NOTICE 'Z reads trade_rfq_tokens.created_by DIRECTLY: yes';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'Z reads trade_rfq_tokens.created_by DIRECTLY: permission denied';
  END;
  PERFORM pg_temp.reset_role();
END $$;
ROLLBACK;
