-- r7 probe F: re-walk r6 BLOCKING-1's own actor — a MANUFACTURER-org co-member
-- of the designer who is not a member of the owning studio
BEGIN;
CREATE OR REPLACE FUNCTION pg_temp.assume_user(p_user_id UUID) RETURNS VOID AS $$
BEGIN
  PERFORM set_config('role','authenticated',true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub',p_user_id::text,'role','authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
END; $$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION pg_temp.assume_user(UUID) TO PUBLIC;

INSERT INTO public.organizations (id, type, name, slug, status) VALUES
  ('e7000000-0000-4000-8000-0000000000a1','manufacturer','R7 Maker Co','r7-maker','active');
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, aud, role)
VALUES ('e7000000-0000-4000-8000-0000000000a2','r7-outsider@patina.invalid','x', now(), now(), now(), 'authenticated','authenticated')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.profiles (id, email, full_name) VALUES
  ('e7000000-0000-4000-8000-0000000000a2','r7-outsider@patina.invalid','R7 Outsider')
ON CONFLICT (id) DO NOTHING;
-- the designer of record and the outsider share ONLY this manufacturer org
INSERT INTO public.organization_members (user_id, organization_id, role, status, joined_at) VALUES
  ('a0000000-0000-0000-0000-000000000004','e7000000-0000-4000-8000-0000000000a1','member','active', now()),
  ('e7000000-0000-4000-8000-0000000000a2','e7000000-0000-4000-8000-0000000000a1','member','active', now())
ON CONFLICT (user_id, organization_id) DO UPDATE SET status='active';

-- paperwork whose tenant IS recorded: a proposal on a studio_id-bearing project
INSERT INTO public.project_parties (id, project_id, party_kind, display_name, created_by)
VALUES ('e7000000-0000-4000-8000-0000000000a4','b0000000-0000-0000-0000-00000000c0d1','sub','R7 Bidder','a0000000-0000-0000-0000-000000000004');
INSERT INTO public.trade_rfq_requests (id, proposal_id, party_id, status, created_by)
VALUES ('e7000000-0000-4000-8000-0000000000a5','b0000000-0000-0000-0000-00000000cb03','e7000000-0000-4000-8000-0000000000a4','sent','a0000000-0000-0000-0000-000000000004');
INSERT INTO public.trade_rfq_tokens (id, rfq_request_id, proposal_id, party_id, token_hash, created_by)
VALUES ('e7000000-0000-4000-8000-0000000000a3','e7000000-0000-4000-8000-0000000000a5','b0000000-0000-0000-0000-00000000cb03','e7000000-0000-4000-8000-0000000000a4', repeat('a',64),'a0000000-0000-0000-0000-000000000004');

SELECT pg_temp.assume_user('e7000000-0000-4000-8000-0000000000a2');

\echo '=== premise: co-member of the designer through ANY org, but not a design-studio co-member, not in the owning studio ==='
SELECT public.is_studio_comember('a0000000-0000-0000-0000-000000000004')        AS comember_any_org,
       public.is_design_studio_comember('a0000000-0000-0000-0000-000000000004') AS design_studio_comember,
       public.is_active_studio_member('b0000000-0000-0000-0000-000000000001')   AS member_of_the_owning_studio;

\echo '=== the four definer readers, and the ledger ==='
SELECT (SELECT count(*) FROM public.access_grants_trade_rfq())             AS rfq,
       (SELECT count(*) FROM public.access_grants_trade_agreement_links()) AS agreement,
       (SELECT count(*) FROM public.access_grants_plan_transmittals())     AS plan,
       (SELECT count(*) FROM public.access_grants_invoice_links())         AS invoice,
       (SELECT count(*) FROM public.v_access_grants
         WHERE tier IN ('rfq_link','agreement_link','plan_link','invoice_pay')) AS through_the_ledger;

\echo '=== and the wave''s tenant-scoped objects ==='
SELECT (SELECT count(*) FROM public.people_directory_seats)     AS seats,
       (SELECT count(*) FROM public.project_site_access_cards)  AS site_cards,
       (SELECT count(*) FROM public.project_party_authority)    AS authority,
       (SELECT count(*) FROM public.studio_compliance_documents) AS docs;
SELECT role, count(*) FROM public.people_directory GROUP BY 1 ORDER BY 1;

\echo '=== positive control: the owning studio''s admin still reads the plan grant ==='
SELECT pg_temp.assume_user('a0000000-0000-0000-0000-000000000003');
SELECT count(*) AS rfq_grants_for_the_owning_admin FROM public.access_grants_trade_rfq();
ROLLBACK;
