-- r14 probe C: folding one household member's duplicate, both ids already
-- members, one of them the primary; plus the consent word after the fold.
BEGIN;
CREATE OR REPLACE FUNCTION pg_temp.assume_user(p_user_id UUID) RETURNS VOID AS $$
BEGIN
  PERFORM set_config('role','authenticated',true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub',p_user_id::text,'role','authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
END; $$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION pg_temp.assume_user(UUID) TO PUBLIC;

INSERT INTO public.organizations (id, type, name, slug, status) VALUES
  ('fc140000-0000-4000-8000-00000000000a','design_studio','R14C Studio','r14c-a','active');
INSERT INTO public.organization_members (user_id, organization_id, role, status, joined_at) VALUES
  ('a0000000-0000-0000-0000-000000000004','fc140000-0000-4000-8000-00000000000a','owner','active',now())
ON CONFLICT (user_id, organization_id) DO UPDATE SET role='owner', status='active';

INSERT INTO public.studio_contacts
  (id, organization_id, entity_kind, contact_kind, full_name, phone_e164, created_by, created_at) VALUES
  ('fc140000-0000-4000-8000-000000000001','fc140000-0000-4000-8000-00000000000a','person','client','R14C Chidi (old)','+16125550801','a0000000-0000-0000-0000-000000000004','2024-01-01'),
  ('fc140000-0000-4000-8000-000000000002','fc140000-0000-4000-8000-00000000000a','person','client','R14C Chidi (new)','+16125550802','a0000000-0000-0000-0000-000000000004','2026-01-01'),
  ('fc140000-0000-4000-8000-000000000003','fc140000-0000-4000-8000-00000000000a','person','client','R14C Adaeze',NULL,'a0000000-0000-0000-0000-000000000004','2024-01-01');

INSERT INTO public.client_households
  (id, organization_id, designer_id, display_name, member_person_ids, primary_member_person_id, created_by)
VALUES ('fc140000-0000-4000-8000-0000000000c1','fc140000-0000-4000-8000-00000000000a',
        'a0000000-0000-0000-0000-000000000004','R14C Household',
        ARRAY['fc140000-0000-4000-8000-000000000001','fc140000-0000-4000-8000-000000000002',
              'fc140000-0000-4000-8000-000000000003']::uuid[],
        'fc140000-0000-4000-8000-000000000002',
        'a0000000-0000-0000-0000-000000000004');

-- the duplicate card's own number carries a recorded refusal
INSERT INTO public.studio_channel_consent
  (organization_id, channel_kind, channel_value, status, opt_out_at, opt_out_source)
VALUES ('fc140000-0000-4000-8000-00000000000a','sms','+16125550802','opted_out', now(), 'inbound_sms')
ON CONFLICT (organization_id, channel_kind, channel_value) DO UPDATE
  SET status='opted_out', opt_out_at = now();

DO $$
DECLARE h public.client_households%ROWTYPE; w text;
BEGIN
  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000004');
  RAISE NOTICE 'C-a BEFORE consent word of the SURVIVOR identity: %',
    public.identity_consent_status('fc140000-0000-4000-8000-00000000000a',
      'fc140000-0000-4000-8000-000000000001', '+16125550801');

  PERFORM public.merge_studio_contacts(
    'fc140000-0000-4000-8000-000000000001','fc140000-0000-4000-8000-000000000002','phone');

  SELECT * INTO h FROM public.client_households
   WHERE id='fc140000-0000-4000-8000-0000000000c1';
  RAISE NOTICE 'C-b AFTER  members=%  primary=%', h.member_person_ids, h.primary_member_person_id;
  RAISE NOTICE 'C-c AFTER  consent word of the survivor identity: %',
    public.identity_consent_status('fc140000-0000-4000-8000-00000000000a',
      'fc140000-0000-4000-8000-000000000001', '+16125550801');
  RAISE NOTICE 'C-d resolve_merged_contact(old dup) = %',
    public.resolve_merged_contact('fc140000-0000-4000-8000-000000000002');
  RAISE NOTICE 'C-e directory rows for the pair: %',
    (SELECT count(*) FROM public.people_directory d
      WHERE d.person_id IN ('fc140000-0000-4000-8000-000000000001','fc140000-0000-4000-8000-000000000002'));
END $$;
ROLLBACK;
