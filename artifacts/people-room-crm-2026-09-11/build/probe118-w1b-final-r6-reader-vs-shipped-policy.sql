-- probe118 — r6: 00627's readers substitute is_studio_comember() for the
-- shipped policies' is_design_studio_comember(). A MANUFACTURER org shared with
-- the designer satisfies the reader's gate and NOT the table's own policy.
\set ON_ERROR_STOP on
BEGIN;
CREATE TEMP TABLE a AS
SELECT (SELECT id FROM public.profiles WHERE email='designer@patina.dev') AS designer,
       'ab100000-0000-4000-8000-000000000001'::uuid AS outsider,
       'ab200000-0000-4000-8000-000000000001'::uuid AS mfr_org;
GRANT SELECT ON a TO authenticated;

INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password,
                        email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
SELECT outsider,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',
       'r6-mfr@probe.test','x',now(),now(),now(),'{}'::jsonb,'{}'::jsonb FROM a ON CONFLICT DO NOTHING;
INSERT INTO public.organizations (id, type, name, slug)
SELECT mfr_org,'manufacturer','R6 Manufacturer','r6-mfr' FROM a ON CONFLICT DO NOTHING;
INSERT INTO public.organization_members (organization_id,user_id,role,status,joined_at)
SELECT mfr_org, outsider,'owner','active',now() FROM a ON CONFLICT DO NOTHING;
INSERT INTO public.organization_members (organization_id,user_id,role,status,joined_at)
SELECT mfr_org, designer,'member','active',now() FROM a ON CONFLICT DO NOTHING;

-- one rfq token + one plan token + one invoice link, all Local Dev Studio's
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
VALUES ('ab600000-0000-4000-8000-000000000001','d0e00000-0000-0000-0000-00000000000a',9002,'R6 issue','r6-key2',repeat('c',64),repeat('d',64),1,(SELECT designer FROM a)) ON CONFLICT DO NOTHING;
INSERT INTO public.plan_transmittals (id,project_id,issue_id,party_display_name,purpose,sent_at,created_by)
VALUES ('ab400000-0000-4000-8000-000000000001','d0e00000-0000-0000-0000-00000000000a','ab600000-0000-4000-8000-000000000001','R6','pricing',now(),(SELECT designer FROM a)) ON CONFLICT DO NOTHING;
INSERT INTO public.plan_transmittal_tokens (id,transmittal_id,project_id,token_hash,status,created_by)
VALUES ('ab500000-0000-4000-8000-000000000001','ab400000-0000-4000-8000-000000000001','d0e00000-0000-0000-0000-00000000000a',repeat('b',64),'active',(SELECT designer FROM a)) ON CONFLICT DO NOTHING;
INSERT INTO public.invoice_links (id,invoice_id,token,status,created_by,created_at,last_viewed_at)
SELECT 'ab300000-0000-4000-8000-000000000001', i.id, repeat('a',64),'active',(SELECT designer FROM a),now(),now()
  FROM public.invoices i WHERE i.designer_id=(SELECT designer FROM a) LIMIT 1 ON CONFLICT DO NOTHING;

SELECT set_config('request.jwt.claims', json_build_object('sub',(SELECT outsider FROM a)::text,'role','authenticated')::text, true);
SET LOCAL ROLE authenticated;

\echo '=== the two predicates, on the same designer ==='
SELECT public.is_studio_comember((SELECT designer FROM a))        AS readers_gate_is_studio_comember,
       public.is_design_studio_comember((SELECT designer FROM a)) AS shipped_policy_gate,
       public.is_active_studio_member('b0000000-0000-0000-0000-000000000001') AS member_of_the_owning_studio;

\echo '=== what the definer readers hand a manufacturer-org co-member ==='
SELECT 'rfq_link' branch, count(*) FROM public.access_grants_trade_rfq()
UNION ALL SELECT 'plan_link', count(*) FROM public.access_grants_plan_transmittals()
UNION ALL SELECT 'invoice_pay', count(*) FROM public.access_grants_invoice_links();

\echo '=== the ledger they read ==='
SELECT tier, count(*) FROM public.v_access_grants GROUP BY tier ORDER BY tier;

\echo '=== and the objects r5 tightened, for contrast ==='
SELECT (SELECT count(*) FROM public.project_site_access_cards) AS site_cards,
       (SELECT count(*) FROM public.people_directory_seats)    AS seats,
       (SELECT count(*) FROM public.project_party_authority)   AS authority;
RESET ROLE;
ROLLBACK;
