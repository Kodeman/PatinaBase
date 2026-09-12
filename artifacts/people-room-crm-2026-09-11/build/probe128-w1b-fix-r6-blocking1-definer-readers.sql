-- probe128 — r6 BLOCKING-1, after the fix. 00627's three loose definer
-- readers now put the TENANT first (project_tenant_org, 00624 §1) and keep
-- is_design_studio_comember beside it. Three actors on the same fixture:
--   A  a MANUFACTURER-org co-member of the designer  → r6's own actor
--   B  a DESIGN-STUDIO co-member of the designer who is not a member of the
--      owning studio → passes the shipped predicate, must still be refused
--   C  the owning studio's own owner → the positive control
\set ON_ERROR_STOP on
BEGIN;
CREATE TEMP TABLE a AS
SELECT (SELECT id FROM public.profiles WHERE email='designer@patina.dev') AS designer,
       'ab100000-0000-4000-8000-000000000001'::uuid AS mfr_outsider,
       'ab200000-0000-4000-8000-000000000001'::uuid AS mfr_org,
       'ab100000-0000-4000-8000-000000000002'::uuid AS ds_outsider,
       'ab200000-0000-4000-8000-000000000002'::uuid AS ds_org;
GRANT SELECT ON a TO authenticated;

INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password,
                        email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
SELECT mfr_outsider,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',
       'r6fix-mfr@probe.test','x',now(),now(),now(),'{}'::jsonb,'{}'::jsonb FROM a ON CONFLICT DO NOTHING;
INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password,
                        email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
SELECT ds_outsider,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',
       'r6fix-ds@probe.test','x',now(),now(),now(),'{}'::jsonb,'{}'::jsonb FROM a ON CONFLICT DO NOTHING;
INSERT INTO public.organizations (id, type, name, slug)
SELECT mfr_org,'manufacturer','R6 Manufacturer','r6fix-mfr' FROM a ON CONFLICT DO NOTHING;
INSERT INTO public.organizations (id, type, name, slug)
SELECT ds_org,'design_studio','R6 Side Studio','r6fix-side' FROM a ON CONFLICT DO NOTHING;
INSERT INTO public.organization_members (organization_id,user_id,role,status,joined_at)
SELECT mfr_org, mfr_outsider,'owner','active',now() FROM a ON CONFLICT DO NOTHING;
INSERT INTO public.organization_members (organization_id,user_id,role,status,joined_at)
SELECT mfr_org, designer,'member','active',now() FROM a ON CONFLICT DO NOTHING;
INSERT INTO public.organization_members (organization_id,user_id,role,status,joined_at)
SELECT ds_org, ds_outsider,'owner','active',now() FROM a ON CONFLICT DO NOTHING;
INSERT INTO public.organization_members (organization_id,user_id,role,status,joined_at)
SELECT ds_org, designer,'member','active',now() FROM a ON CONFLICT DO NOTHING;

-- one rfq token + one plan token + one invoice link + one agreement token,
-- all Local Dev Studio's (probe118's fixture, verbatim)
INSERT INTO public.trade_rfq_requests (id,proposal_id,party_id,scope_snapshot,status)
SELECT 'ab800000-0000-4000-8000-000000000001','b0000000-0000-0000-0000-000000000001',
       (SELECT id FROM public.project_parties WHERE project_id='d0e00000-0000-0000-0000-00000000000a' LIMIT 1),
       '{}'::jsonb,'sent' ON CONFLICT DO NOTHING;
INSERT INTO public.trade_rfq_tokens (id,rfq_request_id,proposal_id,party_id,token_hash,status,created_by)
SELECT 'ab700000-0000-4000-8000-000000000001','ab800000-0000-4000-8000-000000000001',
       'b0000000-0000-0000-0000-000000000001',
       (SELECT id FROM public.project_parties WHERE project_id='d0e00000-0000-0000-0000-00000000000a' LIMIT 1),
       repeat('e',64),'active',(SELECT designer FROM a) ON CONFLICT DO NOTHING;
INSERT INTO public.plan_issues (id,project_id,issue_number,name,idempotency_key,request_hash,set_checksum,sheet_count,created_by)
VALUES ('ab600000-0000-4000-8000-000000000001','d0e00000-0000-0000-0000-00000000000a',9002,'R6 issue','r6fix-key2',repeat('c',64),repeat('d',64),1,(SELECT designer FROM a)) ON CONFLICT DO NOTHING;
INSERT INTO public.plan_transmittals (id,project_id,issue_id,party_display_name,purpose,sent_at,created_by)
VALUES ('ab400000-0000-4000-8000-000000000001','d0e00000-0000-0000-0000-00000000000a','ab600000-0000-4000-8000-000000000001','R6','pricing',now(),(SELECT designer FROM a)) ON CONFLICT DO NOTHING;
INSERT INTO public.plan_transmittal_tokens (id,transmittal_id,project_id,token_hash,status,created_by)
VALUES ('ab500000-0000-4000-8000-000000000001','ab400000-0000-4000-8000-000000000001','d0e00000-0000-0000-0000-00000000000a',repeat('b',64),'active',(SELECT designer FROM a)) ON CONFLICT DO NOTHING;
INSERT INTO public.invoice_links (id,invoice_id,token,status,created_by,created_at,last_viewed_at)
SELECT 'ab300000-0000-4000-8000-000000000001', i.id, repeat('a',64),'active',(SELECT designer FROM a),now(),now()
  FROM public.invoices i WHERE i.designer_id=(SELECT designer FROM a) LIMIT 1 ON CONFLICT DO NOTHING;

\echo '=== the rows exist, as service_role sees them ==='
SELECT (SELECT count(*) FROM public.trade_rfq_tokens WHERE id='ab700000-0000-4000-8000-000000000001') AS rfq_rows,
       (SELECT count(*) FROM public.plan_transmittal_tokens WHERE id='ab500000-0000-4000-8000-000000000001') AS plan_rows,
       (SELECT count(*) FROM public.invoice_links WHERE id='ab300000-0000-4000-8000-000000000001') AS invoice_rows;

-- ── A: the manufacturer-org co-member ──────────────────────────────────────
SELECT set_config('request.jwt.claims', json_build_object('sub',(SELECT mfr_outsider FROM a)::text,'role','authenticated')::text, true);
SET LOCAL ROLE authenticated;
\echo '=== A premise: manufacturer-org co-member of the designer ==='
SELECT public.is_studio_comember((SELECT designer FROM a))        AS comember_any_org,
       public.is_design_studio_comember((SELECT designer FROM a)) AS design_studio_comember,
       public.is_active_studio_member('b0000000-0000-0000-0000-000000000001') AS member_of_the_owning_studio;
\echo '=== A: all four definer readers ==='
SELECT 'rfq_link' branch, count(*) FROM public.access_grants_trade_rfq()
UNION ALL SELECT 'plan_link', count(*) FROM public.access_grants_plan_transmittals()
UNION ALL SELECT 'invoice_pay', count(*) FROM public.access_grants_invoice_links()
UNION ALL SELECT 'agreement_link', count(*) FROM public.access_grants_trade_agreement_links();
\echo '=== A: the whole ledger, by tier ==='
SELECT tier, count(*) FROM public.v_access_grants GROUP BY tier ORDER BY tier;
RESET ROLE;

-- ── B: the design-studio co-member who is not in the owning studio ─────────
SELECT set_config('request.jwt.claims', json_build_object('sub',(SELECT ds_outsider FROM a)::text,'role','authenticated')::text, true);
SET LOCAL ROLE authenticated;
\echo '=== B premise: DESIGN-studio co-member, not a member of the owning studio ==='
SELECT public.is_design_studio_comember((SELECT designer FROM a)) AS shipped_policy_gate,
       public.is_active_studio_member('b0000000-0000-0000-0000-000000000001') AS member_of_the_owning_studio,
       public.project_tenant_org('d0e00000-0000-0000-0000-00000000000a') AS tenant_org_resolved;
\echo '=== B: all four definer readers ==='
SELECT 'rfq_link' branch, count(*) FROM public.access_grants_trade_rfq()
UNION ALL SELECT 'plan_link', count(*) FROM public.access_grants_plan_transmittals()
UNION ALL SELECT 'invoice_pay', count(*) FROM public.access_grants_invoice_links()
UNION ALL SELECT 'agreement_link', count(*) FROM public.access_grants_trade_agreement_links();
RESET ROLE;

-- ── C: the owning studio's own owner ───────────────────────────────────────
SELECT set_config('request.jwt.claims', json_build_object('sub',(SELECT designer FROM a)::text,'role','authenticated')::text, true);
SET LOCAL ROLE authenticated;
\echo '=== C positive control: the studio owner still reads every branch ==='
SELECT 'rfq_link' branch, count(*) FROM public.access_grants_trade_rfq()
UNION ALL SELECT 'plan_link', count(*) FROM public.access_grants_plan_transmittals()
UNION ALL SELECT 'invoice_pay', count(*) FROM public.access_grants_invoice_links()
UNION ALL SELECT 'agreement_link', count(*) FROM public.access_grants_trade_agreement_links();
\echo '=== C: no bearer credential in the ledger (the carried rule) ==='
SELECT count(*) AS rows_carrying_a_64_hex_token
  FROM public.v_access_grants g
 WHERE g.grant_id ~ '[0-9a-f]{64}';
RESET ROLE;
ROLLBACK;
