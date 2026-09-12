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

\echo '=== premise: the invoice and the proposal this walks ==='
SELECT 'invoice e142: studio_id / project_id / project.studio_id' q,
       format('%s / %s / %s', coalesce(i.studio_id::text,'<null>'), coalesce(i.project_id::text,'<null>'),
              coalesce(pj.studio_id::text,'<null>')) v
  FROM invoices i LEFT JOIN projects pj ON pj.id=i.project_id
 WHERE i.id='b0000000-0000-0000-0000-00000000e142';

-- an ordinary studio act: mint a pay link on that invoice
INSERT INTO invoice_links (id, invoice_id, token, created_by, last_viewed_at, view_count)
VALUES ('ad000000-0000-4000-8000-000000000001','b0000000-0000-0000-0000-00000000e142',
        repeat('b',64),'a0000000-0000-0000-0000-000000000004', now() - interval '2 hours', 3);

-- and an RFQ token on a proposal that records no project at all
INSERT INTO trade_rfq_requests (id, proposal_id, party_id, created_by)
SELECT 'ad000000-0000-4000-8000-00000000000f','b0000000-0000-0000-0000-000000000002', pp.id,'a0000000-0000-0000-0000-000000000004'
  FROM project_parties pp WHERE pp.project_id='d0e00000-0000-0000-0000-00000000000a' LIMIT 1;
INSERT INTO trade_rfq_tokens (id, rfq_request_id, proposal_id, party_id, token_hash, created_by)
SELECT 'ad000000-0000-4000-8000-000000000002','ad000000-0000-4000-8000-00000000000f',
       'b0000000-0000-0000-0000-000000000002', pp.id, repeat('c',64),'a0000000-0000-0000-0000-000000000004'
  FROM project_parties pp WHERE pp.project_id='d0e00000-0000-0000-0000-00000000000a' LIMIT 1;

\echo '=== A. as Z (member of the designer''s SECOND design studio ONLY) ==='
SELECT pg_temp.assume_user('a0000000-0000-0000-0000-000000000005');
SELECT 'Z is_active_studio_member(LocalDev)' q, public.is_active_studio_member('b0000000-0000-0000-0000-000000000001')::text v
UNION ALL SELECT 'Z project_tenant_org(Aspen, studio-less)', coalesce(public.project_tenant_org('b0000000-0000-0000-0000-0000000000d1')::text,'<null>');
\echo '-- invoice_pay rows Z reads through the definer reader:'
SELECT grant_id, tier, scope_id, granted_at::date, last_used_at, revoked_at, revoke_reason
  FROM public.access_grants_invoice_links();
\echo '-- rfq_link rows Z reads through the definer reader:'
SELECT grant_id, tier, subject_id, scope_id, expires_at::date FROM public.access_grants_trade_rfq();
\echo '-- and through the ledger view:'
SELECT tier, count(*) FROM public.v_access_grants WHERE tier IN ('invoice_pay','rfq_link') GROUP BY 1;
\echo '-- can Z read the underlying tables directly?'
DO $$ BEGIN
  BEGIN PERFORM 1 FROM public.invoice_links LIMIT 1; RAISE NOTICE 'Z invoice_links direct: READABLE';
  EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'Z invoice_links direct: permission denied'; END;
  BEGIN PERFORM 1 FROM public.trade_rfq_tokens LIMIT 1; RAISE NOTICE 'Z trade_rfq_tokens direct: READABLE';
  EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'Z trade_rfq_tokens direct: permission denied'; END;
END $$;
SELECT pg_temp.reset_role();

\echo '=== B. as Y (manufacturer-org co-member of the same designer) — r6 BLOCKING-1''s actor ==='
INSERT INTO organizations (id, type, name, slug, status)
VALUES ('e9000000-0000-4000-8000-000000000001','manufacturer','Probe Mfg 156','probe-mfg-156','active');
INSERT INTO organization_members (user_id, organization_id, role, status, joined_at) VALUES
  ('a0000000-0000-0000-0000-000000000006','e9000000-0000-4000-8000-000000000001','member','active',now()),
  ('a0000000-0000-0000-0000-000000000004','e9000000-0000-4000-8000-000000000001','member','active',now());
SELECT pg_temp.assume_user('a0000000-0000-0000-0000-000000000006');
SELECT 'Y invoice_pay rows' q, count(*)::text v FROM public.access_grants_invoice_links()
UNION ALL SELECT 'Y rfq_link rows', count(*)::text FROM public.access_grants_trade_rfq();
SELECT pg_temp.reset_role();

\echo '=== C. as X (unrelated studio owner) ==='
INSERT INTO organizations (id, type, name, slug, status)
VALUES ('e9000000-0000-4000-8000-000000000002','design_studio','Probe Unrelated 156','probe-unrel-156','active');
INSERT INTO organization_members (user_id, organization_id, role, status, joined_at) VALUES
  ('a0000000-0000-0000-0000-000000000007','e9000000-0000-4000-8000-000000000002','owner','active',now());
SELECT pg_temp.assume_user('a0000000-0000-0000-0000-000000000007');
SELECT 'X invoice_pay rows' q, count(*)::text v FROM public.access_grants_invoice_links()
UNION ALL SELECT 'X rfq_link rows', count(*)::text FROM public.access_grants_trade_rfq();
SELECT pg_temp.reset_role();

\echo '=== D. control: the ADMIN of the studio doing the work ==='
SELECT pg_temp.assume_user('a0000000-0000-0000-0000-000000000003');
SELECT 'ADMIN invoice_pay rows' q, count(*)::text v FROM public.access_grants_invoice_links()
UNION ALL SELECT 'ADMIN rfq_link rows', count(*)::text FROM public.access_grants_trade_rfq();
SELECT pg_temp.reset_role();

\echo '=== E. no bearer credential in what Z read ==='
SELECT 'any grant_id matching a 64-hex token' q, count(*)::text v
  FROM public.v_access_grants WHERE grant_id ~ '[0-9a-f]{64}';
ROLLBACK;
