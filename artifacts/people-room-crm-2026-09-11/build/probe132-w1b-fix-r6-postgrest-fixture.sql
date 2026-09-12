-- probe132 — r6 fix: the COMMITTED fixture probe123's script reads over the
-- public API. Unlike probe124 every grant here sits on paperwork whose tenant
-- IS recorded (proposal …cb03 on project …c0d1, invoice …cc01 naming
-- studio_id, plan token on the seeded Okonkwo job), so the tenant leg — not
-- the absence of a tenant — is what the API answer measures. Two actors:
-- a MANUFACTURER-org co-member of the designer, and a DESIGN-studio one.
-- Torn down by probe134 immediately afterwards.
\set ON_ERROR_STOP on
INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password,
                        email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
VALUES ('af100000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000',
        'authenticated','authenticated','r6fix-api-mfr@probe.test','x',now(),now(),now(),'{}'::jsonb,'{}'::jsonb),
       ('af100000-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000000',
        'authenticated','authenticated','r6fix-api-ds@probe.test','x',now(),now(),now(),'{}'::jsonb,'{}'::jsonb)
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.organizations (id, type, name, slug) VALUES
 ('af200000-0000-4000-8000-000000000001','manufacturer','R6fix API Side Org','r6fix-api-side'),
 ('af200000-0000-4000-8000-000000000002','design_studio','R6fix API Side Studio','r6fix-api-studio')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.organization_members (organization_id,user_id,role,status,joined_at) VALUES
 ('af200000-0000-4000-8000-000000000001','af100000-0000-4000-8000-000000000001','owner','active',now()),
 ('af200000-0000-4000-8000-000000000002','af100000-0000-4000-8000-000000000002','owner','active',now())
ON CONFLICT DO NOTHING;
INSERT INTO public.organization_members (organization_id,user_id,role,status,joined_at) VALUES
 ('af200000-0000-4000-8000-000000000001','a0000000-0000-0000-0000-000000000004','member','active',now()),
 ('af200000-0000-4000-8000-000000000002','a0000000-0000-0000-0000-000000000004','member','active',now())
ON CONFLICT DO NOTHING;

INSERT INTO public.invoice_links (id,invoice_id,token,status,created_by,created_at,last_viewed_at)
VALUES ('af300000-0000-4000-8000-000000000001','b0000000-0000-0000-0000-00000000cc01',repeat('a',64),'active',
        'a0000000-0000-0000-0000-000000000004',now(),now())
ON CONFLICT DO NOTHING;
INSERT INTO public.plan_issues (id,project_id,issue_number,name,idempotency_key,request_hash,set_checksum,sheet_count,created_by)
VALUES ('af600000-0000-4000-8000-000000000001','d0e00000-0000-0000-0000-00000000000a',9201,'R6fix API issue','r6fix-api-key',repeat('c',64),repeat('d',64),1,'a0000000-0000-0000-0000-000000000004')
ON CONFLICT DO NOTHING;
INSERT INTO public.plan_transmittals (id,project_id,issue_id,party_display_name,purpose,sent_at,created_by)
VALUES ('af400000-0000-4000-8000-000000000001','d0e00000-0000-0000-0000-00000000000a','af600000-0000-4000-8000-000000000001','R6fix API','pricing',now(),'a0000000-0000-0000-0000-000000000004')
ON CONFLICT DO NOTHING;
INSERT INTO public.plan_transmittal_tokens (id,transmittal_id,project_id,token_hash,status,created_by)
VALUES ('af500000-0000-4000-8000-000000000001','af400000-0000-4000-8000-000000000001','d0e00000-0000-0000-0000-00000000000a',repeat('b',64),'active','a0000000-0000-0000-0000-000000000004')
ON CONFLICT DO NOTHING;
INSERT INTO public.trade_rfq_requests (id,proposal_id,party_id,scope_snapshot,status)
SELECT 'af800000-0000-4000-8000-000000000001','b0000000-0000-0000-0000-00000000cb03',
       (SELECT id FROM public.project_parties WHERE project_id='d0e00000-0000-0000-0000-00000000000a' LIMIT 1),
       '{}'::jsonb,'sent'
ON CONFLICT DO NOTHING;
INSERT INTO public.trade_rfq_tokens (id,rfq_request_id,proposal_id,party_id,token_hash,status,created_by)
SELECT 'af700000-0000-4000-8000-000000000001','af800000-0000-4000-8000-000000000001',
       'b0000000-0000-0000-0000-00000000cb03',
       (SELECT id FROM public.project_parties WHERE project_id='d0e00000-0000-0000-0000-00000000000a' LIMIT 1),
       repeat('e',64),'active','a0000000-0000-0000-0000-000000000004'
ON CONFLICT DO NOTHING;
SELECT 'fixture committed' AS ok;
