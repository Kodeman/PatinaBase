-- probe124 — r6: the COMMITTED fixture probe123 reads over the API.
-- Torn down by probe125 immediately afterwards.
\set ON_ERROR_STOP on
INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password,
                        email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
VALUES ('ad100000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000',
        'authenticated','authenticated','r6-api-outsider@probe.test','x',now(),now(),now(),'{}'::jsonb,'{}'::jsonb)
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.organizations (id, type, name, slug)
VALUES ('ad200000-0000-4000-8000-000000000001','manufacturer','R6 API Side Org','r6-api-side-org')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.organization_members (organization_id,user_id,role,status,joined_at) VALUES
 ('ad200000-0000-4000-8000-000000000001','ad100000-0000-4000-8000-000000000001','owner','active',now()),
 ('ad200000-0000-4000-8000-000000000001','a0000000-0000-0000-0000-000000000004','member','active',now())
ON CONFLICT DO NOTHING;

INSERT INTO public.invoice_links (id,invoice_id,token,status,created_by,created_at,last_viewed_at)
SELECT 'ad300000-0000-4000-8000-000000000001', i.id, repeat('a',64),'active',
       'a0000000-0000-0000-0000-000000000004',now(),now()
  FROM public.invoices i WHERE i.designer_id='a0000000-0000-0000-0000-000000000004' LIMIT 1
ON CONFLICT DO NOTHING;

INSERT INTO public.plan_issues (id,project_id,issue_number,name,idempotency_key,request_hash,set_checksum,sheet_count,created_by)
VALUES ('ad600000-0000-4000-8000-000000000001','d0e00000-0000-0000-0000-00000000000a',9101,'R6 API issue','r6-api-key',repeat('c',64),repeat('d',64),1,'a0000000-0000-0000-0000-000000000004')
ON CONFLICT DO NOTHING;
INSERT INTO public.plan_transmittals (id,project_id,issue_id,party_display_name,purpose,sent_at,created_by)
VALUES ('ad400000-0000-4000-8000-000000000001','d0e00000-0000-0000-0000-00000000000a','ad600000-0000-4000-8000-000000000001','R6 API','pricing',now(),'a0000000-0000-0000-0000-000000000004')
ON CONFLICT DO NOTHING;
INSERT INTO public.plan_transmittal_tokens (id,transmittal_id,project_id,token_hash,status,created_by)
VALUES ('ad500000-0000-4000-8000-000000000001','ad400000-0000-4000-8000-000000000001','d0e00000-0000-0000-0000-00000000000a',repeat('b',64),'active','a0000000-0000-0000-0000-000000000004')
ON CONFLICT DO NOTHING;

INSERT INTO public.trade_rfq_requests (id,proposal_id,party_id,scope_snapshot,status)
SELECT 'ad800000-0000-4000-8000-000000000001','b0000000-0000-0000-0000-000000000001',
       (SELECT id FROM public.project_parties WHERE project_id='d0e00000-0000-0000-0000-00000000000a' LIMIT 1),
       '{}'::jsonb,'sent' ON CONFLICT DO NOTHING;
INSERT INTO public.trade_rfq_tokens (id,rfq_request_id,proposal_id,party_id,token_hash,status,created_by)
SELECT 'ad700000-0000-4000-8000-000000000001','ad800000-0000-4000-8000-000000000001',
       'b0000000-0000-0000-0000-000000000001',
       (SELECT id FROM public.project_parties WHERE project_id='d0e00000-0000-0000-0000-00000000000a' LIMIT 1),
       repeat('e',64),'active','a0000000-0000-0000-0000-000000000004' ON CONFLICT DO NOTHING;
SELECT 'fixture committed' AS ok;
