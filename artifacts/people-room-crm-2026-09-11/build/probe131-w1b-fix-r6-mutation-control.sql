-- probe131 — r6: does the fix carry the weight, and do the new suite legs
-- bite? One transaction, rolled back: restore the THREE old reader bodies and
-- the old gate resolver, then replay block 13's new legs (13v/13w/13x) and
-- probe129's MAJOR-1 walk against them. Every number here is what the suite
-- would report as a FAILURE if the fix were reverted.
\set ON_ERROR_STOP on
BEGIN;
-- block 13's fixture, verbatim
INSERT INTO public.organizations (id, type, name, slug, status) VALUES
  ('f1000000-0000-4000-8000-00000000000b','design_studio','Test Studio B','w1b-studio-b','active')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.organization_members (user_id, organization_id, role, status, joined_at) VALUES
  ('a0000000-0000-0000-0000-000000000004','f1000000-0000-4000-8000-00000000000b','owner','active', now()),
  ('a0000000-0000-0000-0000-000000000002','f1000000-0000-4000-8000-00000000000b','member','active', now())
ON CONFLICT (user_id, organization_id) DO UPDATE SET role = EXCLUDED.role, status='active';
INSERT INTO public.trade_rfq_requests (id, proposal_id, party_id, scope_snapshot, status)
VALUES ('f1800000-0000-4000-8000-00000000000b','b0000000-0000-0000-0000-00000000cb03',
        (SELECT id FROM public.project_parties WHERE project_id='d0e00000-0000-0000-0000-00000000000a' LIMIT 1),
        '{}'::jsonb,'sent');
INSERT INTO public.trade_rfq_tokens (id, rfq_request_id, proposal_id, party_id, token_hash, status, created_by)
VALUES ('f1700000-0000-4000-8000-00000000000b','f1800000-0000-4000-8000-00000000000b',
        'b0000000-0000-0000-0000-00000000cb03',
        (SELECT id FROM public.project_parties WHERE project_id='d0e00000-0000-0000-0000-00000000000a' LIMIT 1),
        repeat('e',64),'active','a0000000-0000-0000-0000-000000000004');
INSERT INTO public.plan_issues (id,project_id,issue_number,name,idempotency_key,request_hash,set_checksum,sheet_count,created_by)
VALUES ('f1600000-0000-4000-8000-00000000000b','d0e00000-0000-0000-0000-00000000000a',9013,'mutation','p131-key',repeat('c',64),repeat('d',64),1,'a0000000-0000-0000-0000-000000000004');
INSERT INTO public.plan_transmittals (id,project_id,issue_id,party_display_name,purpose,sent_at,created_by)
VALUES ('f1400000-0000-4000-8000-00000000000b','d0e00000-0000-0000-0000-00000000000a','f1600000-0000-4000-8000-00000000000b','p131','pricing',now(),'a0000000-0000-0000-0000-000000000004');
INSERT INTO public.plan_transmittal_tokens (id,transmittal_id,project_id,token_hash,status,created_by)
VALUES ('f1500000-0000-4000-8000-00000000000b','f1400000-0000-4000-8000-00000000000b','d0e00000-0000-0000-0000-00000000000a',repeat('b',64),'active','a0000000-0000-0000-0000-000000000004');
INSERT INTO public.invoice_links (id,invoice_id,token,status,created_by,created_at,last_viewed_at)
VALUES ('f1300000-0000-4000-8000-00000000000b','b0000000-0000-0000-0000-00000000cc01',repeat('a',64),'active','a0000000-0000-0000-0000-000000000004',now(),now());
-- and a seat, a card and a grant on a studio-less project (probe129's walk)
INSERT INTO public.project_parties (id, project_id, party_kind, display_name, phone_e164, trade)
VALUES ('ac100000-0000-4000-8000-000000000001','b0000000-0000-0000-0000-0000000000d1','sub','R6 Studioless Sub','+16125559991','electrical');
INSERT INTO public.project_site_access_cards (project_id, lockbox_version)
VALUES ('b0000000-0000-0000-0000-0000000000d1','R6 lockbox v1');
INSERT INTO public.project_party_authority (engagement_id, scope)
VALUES ('ac100000-0000-4000-8000-000000000001','selections');

\echo '=== AFTER the fix: block 13 legs 13v/13w/13x, and the MAJOR-1 walk ==='
SELECT set_config('request.jwt.claims','{"sub":"a0000000-0000-0000-0000-000000000002","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
SELECT (SELECT count(*) FROM public.access_grants_trade_rfq()
          WHERE grant_id='rfq_link:f1700000-0000-4000-8000-00000000000b')       AS leg_13v_rfq,
       (SELECT count(*) FROM public.access_grants_plan_transmittals()
          WHERE grant_id='plan_link:f1500000-0000-4000-8000-00000000000b')      AS leg_13w_plan,
       (SELECT count(*) FROM public.access_grants_invoice_links()
          WHERE grant_id='invoice_pay:f1300000-0000-4000-8000-00000000000b')    AS leg_13x_invoice;
RESET ROLE;
SELECT set_config('request.jwt.claims','{"sub":"a0000000-0000-0000-0000-000000000003","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
SELECT (SELECT count(*) FROM public.people_directory_seats WHERE project_id='b0000000-0000-0000-0000-0000000000d1') AS admin_seats,
       (SELECT count(*) FROM public.project_site_access_cards WHERE project_id='b0000000-0000-0000-0000-0000000000d1') AS admin_cards,
       (SELECT count(*) FROM public.project_party_authority WHERE engagement_id='ac100000-0000-4000-8000-000000000001') AS admin_grants;
RESET ROLE;

-- ─── revert the fix, in this transaction only ──────────────────────────────
CREATE OR REPLACE FUNCTION public.access_grants_trade_rfq()
RETURNS TABLE (grant_id text, tier text, subject_type text, subject_id uuid,
  scope_type text, scope_id uuid, granted_by uuid, granted_at timestamptz,
  expires_at timestamptz, last_used_at timestamptz, revoked_at timestamptz, revoke_reason text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT 'rfq_link:' || t.id::text, 'rfq_link', 'engagement', t.party_id,
    'proposal', t.proposal_id, t.created_by, t.created_at, t.expires_at, t.last_used_at,
    CASE WHEN t.status = 'revoked' THEN t.updated_at END, NULL::text
  FROM public.trade_rfq_tokens t
  JOIN public.proposals pr ON pr.id = t.proposal_id
  WHERE public.is_studio_comember(pr.designer_id);
$$;
CREATE OR REPLACE FUNCTION public.access_grants_plan_transmittals()
RETURNS TABLE (grant_id text, tier text, subject_type text, subject_id uuid,
  scope_type text, scope_id uuid, granted_by uuid, granted_at timestamptz,
  expires_at timestamptz, last_used_at timestamptz, revoked_at timestamptz, revoke_reason text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT 'plan_link:' || p.id::text, 'plan_link', 'link', p.id,
    'project', p.project_id, p.created_by, p.created_at, p.expires_at,
    COALESCE(p.last_used_at, p.first_opened_at),
    CASE WHEN p.status = 'revoked' THEN p.updated_at END, NULL::text
  FROM public.plan_transmittal_tokens p
  JOIN public.projects pj ON pj.id = p.project_id
  WHERE public.is_studio_comember(pj.designer_id);
$$;
CREATE OR REPLACE FUNCTION public.access_grants_invoice_links()
RETURNS TABLE (grant_id text, tier text, subject_type text, subject_id uuid,
  scope_type text, scope_id uuid, granted_by uuid, granted_at timestamptz,
  expires_at timestamptz, last_used_at timestamptz, revoked_at timestamptz, revoke_reason text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT 'invoice_pay:' || il.id::text, 'invoice_pay', 'link', il.id,
    'invoice', il.invoice_id, il.created_by, il.created_at,
    NULL::timestamptz, il.last_viewed_at, il.revoked_at,
    CASE WHEN il.status = 'closed' THEN 'closed' END
  FROM public.invoice_links il
  JOIN public.invoices inv ON inv.id = il.invoice_id
  WHERE public.is_studio_comember(inv.designer_id);
$$;
-- and the gate resolver, back to the consent resolver r5 used
CREATE OR REPLACE FUNCTION public.project_tenant_org(p_project_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT public.project_consent_org(p_project_id);
$$;

\echo '=== BEFORE the fix (reverted): the same four numbers ==='
SELECT set_config('request.jwt.claims','{"sub":"a0000000-0000-0000-0000-000000000002","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
SELECT (SELECT count(*) FROM public.access_grants_trade_rfq()
          WHERE grant_id='rfq_link:f1700000-0000-4000-8000-00000000000b')       AS leg_13v_rfq,
       (SELECT count(*) FROM public.access_grants_plan_transmittals()
          WHERE grant_id='plan_link:f1500000-0000-4000-8000-00000000000b')      AS leg_13w_plan,
       (SELECT count(*) FROM public.access_grants_invoice_links()
          WHERE grant_id='invoice_pay:f1300000-0000-4000-8000-00000000000b')    AS leg_13x_invoice;
RESET ROLE;
SELECT set_config('request.jwt.claims','{"sub":"a0000000-0000-0000-0000-000000000003","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
SELECT (SELECT count(*) FROM public.people_directory_seats WHERE project_id='b0000000-0000-0000-0000-0000000000d1') AS admin_seats,
       (SELECT count(*) FROM public.project_site_access_cards WHERE project_id='b0000000-0000-0000-0000-0000000000d1') AS admin_cards,
       (SELECT count(*) FROM public.project_party_authority WHERE engagement_id='ac100000-0000-4000-8000-000000000001') AS admin_grants;
RESET ROLE;
ROLLBACK;
