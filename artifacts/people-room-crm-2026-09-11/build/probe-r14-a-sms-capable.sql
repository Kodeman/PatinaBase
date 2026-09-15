-- r14 probe A: does a merge carry the absorbed channel row's sms_capable?
-- One transaction, ROLLBACKed.
BEGIN;
CREATE OR REPLACE FUNCTION pg_temp.assume_user(p_user_id UUID) RETURNS VOID AS $$
BEGIN
  PERFORM set_config('role','authenticated',true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub',p_user_id::text,'role','authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
END; $$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION pg_temp.assume_user(UUID) TO PUBLIC;

INSERT INTO public.organizations (id, type, name, slug, status) VALUES
  ('fa140000-0000-4000-8000-00000000000a','design_studio','R14 Studio','r14-studio-a','active');
INSERT INTO public.organization_members (user_id, organization_id, role, status, joined_at) VALUES
  ('a0000000-0000-0000-0000-000000000004','fa140000-0000-4000-8000-00000000000a','owner','active',now())
ON CONFLICT (user_id, organization_id) DO UPDATE SET role='owner', status='active';

-- crm-model §4 rule 2's canonical duplicate: two cards, one phone.
INSERT INTO public.studio_contacts
  (id, organization_id, entity_kind, contact_kind, full_name, created_by, created_at) VALUES
  ('fa140000-0000-4000-8000-000000000001','fa140000-0000-4000-8000-00000000000a','person','sub','R14 Older','a0000000-0000-0000-0000-000000000004','2024-01-01'),
  ('fa140000-0000-4000-8000-000000000002','fa140000-0000-4000-8000-00000000000a','person','sub','R14 Newer','a0000000-0000-0000-0000-000000000004','2026-01-01');

-- The survivor's mobile row is the unconfirmed one 00593's backfill leaves
-- (sms_capable false). The absorbed card's row is the one the studio
-- CONFIRMED through the Reach editor's line-type act (CR13-1).
INSERT INTO public.studio_contact_channels
  (owner_type, owner_id, channel_kind, value, sms_capable, verified, preferred, label, status) VALUES
  ('person','fa140000-0000-4000-8000-000000000001','mobile','+16125550941', false, false, false, NULL, 'active'),
  ('person','fa140000-0000-4000-8000-000000000002','mobile','+16125550941', true,  false, false, NULL, 'active');

DO $$
DECLARE c public.studio_contact_channels%ROWTYPE; n integer;
BEGIN
  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000004');
  SELECT * INTO c FROM public.studio_contact_channels
   WHERE owner_id='fa140000-0000-4000-8000-000000000002' AND channel_kind='mobile';
  RAISE NOTICE 'A-a BEFORE  absorbed row sms_capable=%  survivor row sms_capable=%',
    c.sms_capable,
    (SELECT s.sms_capable FROM public.studio_contact_channels s
      WHERE s.owner_id='fa140000-0000-4000-8000-000000000001' AND s.channel_kind='mobile');

  PERFORM public.merge_studio_contacts(
    'fa140000-0000-4000-8000-000000000001','fa140000-0000-4000-8000-000000000002','phone');

  SELECT count(*) INTO n FROM public.studio_contact_channels
   WHERE owner_id='fa140000-0000-4000-8000-000000000002';
  SELECT * INTO c FROM public.studio_contact_channels
   WHERE owner_id='fa140000-0000-4000-8000-000000000001' AND channel_kind='mobile'
     AND value='+16125550941';
  RAISE NOTICE 'A-b AFTER   survivor row sms_capable=%  (rows left on folded card: %)', c.sms_capable, n;
  IF c.sms_capable THEN
    RAISE NOTICE 'A-c sms_capable TRAVELLED';
  ELSE
    RAISE NOTICE 'A-c sms_capable WAS DESTROYED by the fold';
  END IF;
END $$;
ROLLBACK;
