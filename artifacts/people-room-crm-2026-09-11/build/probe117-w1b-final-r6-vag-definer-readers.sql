-- probe117 — r6: are 00627's four SECURITY DEFINER readers tenant-scoped?
-- Builds a THIRD studio holding the seeded studio's designer plus one outsider,
-- then asks the readers as that outsider. Rolled back.
\set ON_ERROR_STOP on
BEGIN;

\echo '=== actors ==='
CREATE TEMP TABLE a AS
SELECT (SELECT id FROM public.profiles WHERE email='designer@patina.dev')      AS designer,
       'aa100000-0000-4000-8000-000000000001'::uuid                            AS outsider,
       'aa200000-0000-4000-8000-000000000001'::uuid                            AS side_org;

INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password,
                        email_confirmed_at, created_at, updated_at,
                        raw_app_meta_data, raw_user_meta_data)
SELECT outsider, '00000000-0000-0000-0000-000000000000', 'authenticated','authenticated',
       'r6-outsider@probe.test','x', now(), now(), now(), '{}'::jsonb, '{}'::jsonb FROM a
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.profiles (id, email, full_name, role)
SELECT outsider, 'r6-outsider@probe.test', 'R6 Outsider', 'designer' FROM a
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.organizations (id, type, name, slug)
SELECT side_org, (SELECT type FROM public.organizations WHERE id='b0000000-0000-0000-0000-000000000001'),
       'R6 Side Studio', 'r6-side-studio' FROM a
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.organization_members (organization_id, user_id, role, status, joined_at)
SELECT side_org, outsider, 'owner', 'active', now() FROM a
ON CONFLICT DO NOTHING;
INSERT INTO public.organization_members (organization_id, user_id, role, status, joined_at)
SELECT side_org, designer, 'member', 'active', now() FROM a
ON CONFLICT DO NOTHING;

GRANT SELECT ON a TO authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', outsider::text, 'role','authenticated')::text, true) FROM a;
SET LOCAL ROLE authenticated;
\echo '-- premise: comember of the seeded studio designer, NOT a member of Local Dev Studio'
SELECT public.is_studio_comember((SELECT designer FROM a))              AS comember_of_designer,
       public.is_active_studio_member('b0000000-0000-0000-0000-000000000001') AS member_of_local_dev;
RESET ROLE;
SELECT set_config('request.jwt.claims', NULL, true);

\echo '=== fixture: one grant row in EACH of the four grant-closed sources, all owned by Local Dev Studio ==='
-- invoice_pay
INSERT INTO public.invoice_links (id, invoice_id, token, status, created_by, created_at, last_viewed_at)
SELECT 'aa300000-0000-4000-8000-000000000001', i.id, repeat('a',64), 'active',
       (SELECT designer FROM a), now(), now()
  FROM public.invoices i
  JOIN public.projects pj ON pj.id = i.project_id
 WHERE i.designer_id = (SELECT designer FROM a)
 LIMIT 1
ON CONFLICT DO NOTHING;

-- plan_link
INSERT INTO public.plan_issues (id, project_id, issue_number, name, idempotency_key,
                                request_hash, set_checksum, sheet_count, created_by)
VALUES ('aa600000-0000-4000-8000-000000000001','d0e00000-0000-0000-0000-00000000000a',
        9001,'R6 probe issue','r6-probe-key', repeat('c',64), repeat('d',64), 1,
        (SELECT designer FROM a))
ON CONFLICT DO NOTHING;
INSERT INTO public.plan_transmittals (id, project_id, issue_id, party_display_name, purpose, sent_at, created_by)
VALUES ('aa400000-0000-4000-8000-000000000001','d0e00000-0000-0000-0000-00000000000a',
        'aa600000-0000-4000-8000-000000000001','R6 Probe Recipient','pricing', now(), (SELECT designer FROM a))
ON CONFLICT DO NOTHING;
INSERT INTO public.plan_transmittal_tokens (id, transmittal_id, project_id, token_hash, status, created_by)
VALUES ('aa500000-0000-4000-8000-000000000001','aa400000-0000-4000-8000-000000000001',
        'd0e00000-0000-0000-0000-00000000000a', repeat('b',64), 'active',
        (SELECT designer FROM a))
ON CONFLICT DO NOTHING;

-- rfq_link
INSERT INTO public.trade_rfq_requests (id, proposal_id, party_id, scope_snapshot, status)
SELECT 'aa800000-0000-4000-8000-000000000001','b0000000-0000-0000-0000-000000000001',
       (SELECT id FROM public.project_parties WHERE project_id='d0e00000-0000-0000-0000-00000000000a' LIMIT 1),
       '{}'::jsonb, 'sent'
ON CONFLICT DO NOTHING;
INSERT INTO public.trade_rfq_tokens (id, rfq_request_id, proposal_id, party_id, token_hash, status, created_by)
SELECT 'aa700000-0000-4000-8000-000000000001', 'aa800000-0000-4000-8000-000000000001',
       'b0000000-0000-0000-0000-000000000001',
       (SELECT id FROM public.project_parties WHERE project_id='d0e00000-0000-0000-0000-00000000000a' LIMIT 1),
       repeat('e',64), 'active', (SELECT designer FROM a)
ON CONFLICT DO NOTHING;

\echo '-- what landed'
SELECT 'invoice_links' src, count(*) FROM public.invoice_links
UNION ALL SELECT 'plan_transmittal_tokens', count(*) FROM public.plan_transmittal_tokens
UNION ALL SELECT 'trade_rfq_tokens', count(*) FROM public.trade_rfq_tokens;

\echo '=== AS THE OUTSIDER: the four definer readers ==='
GRANT SELECT ON a TO authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', outsider::text, 'role','authenticated')::text, true) FROM a;
SET LOCAL ROLE authenticated;

\echo '-- access_grants_invoice_links() (invoice_links: RLS ON, ZERO policies, no auth SELECT grant)'
SELECT grant_id, tier, scope_type, scope_id, granted_by IS NOT NULL AS has_granted_by, last_used_at IS NOT NULL AS has_last_used
  FROM public.access_grants_invoice_links();

\echo '-- access_grants_plan_transmittals()'
SELECT grant_id, tier, subject_id, scope_type, scope_id FROM public.access_grants_plan_transmittals();

\echo '-- access_grants_trade_rfq()'
SELECT count(*) AS rfq_rows FROM public.access_grants_trade_rfq();

\echo '-- access_grants_trade_agreement_links()'
SELECT count(*) AS agreement_rows FROM public.access_grants_trade_agreement_links();

\echo '-- and the whole ledger, by tier'
SELECT tier, count(*) FROM public.v_access_grants GROUP BY tier ORDER BY tier;

\echo '-- CONTROL: the same outsider on the objects r5 tightened'
SELECT (SELECT count(*) FROM public.project_site_access_cards) AS site_cards,
       (SELECT count(*) FROM public.project_party_authority)   AS authority,
       (SELECT count(*) FROM public.people_directory_seats)    AS seats,
       (SELECT count(*) FROM public.studio_compliance_documents) AS docs;

RESET ROLE;
SELECT set_config('request.jwt.claims', NULL, true);
ROLLBACK;
