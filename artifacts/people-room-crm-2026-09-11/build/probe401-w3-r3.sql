-- W3 round-3 adversarial probe, part 2. One transaction, ROLLBACKed. Local only.
BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.assume_user(p_user_id UUID)
RETURNS VOID AS $$
BEGIN
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', p_user_id::text, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
END; $$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION pg_temp.assume_user(UUID) TO PUBLIC;

CREATE OR REPLACE FUNCTION pg_temp.reset_role() RETURNS VOID AS $$
BEGIN EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims', NULL, true); END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION pg_temp.reset_role() TO PUBLIC;

INSERT INTO public.organizations (id, type, name, slug, status) VALUES
  ('fb000000-0000-4000-8000-00000000000a','design_studio','P401 Studio A','p401-a','active');
INSERT INTO public.organization_members (user_id, organization_id, role, status, joined_at) VALUES
  ('a0000000-0000-0000-0000-000000000004','fb000000-0000-4000-8000-00000000000a','owner','active',now())
ON CONFLICT (user_id, organization_id) DO UPDATE SET role=EXCLUDED.role, status='active';

-- Two PERSON cards for one human, matched on EMAIL (crm-model §4 rule 3), each
-- carrying its own number. The duplicate's number is opted out of texting.
INSERT INTO public.studio_contacts
  (id, organization_id, entity_kind, contact_kind, full_name, phone, email, created_by, created_at) VALUES
  ('fb100000-0000-4000-8000-000000000001','fb000000-0000-4000-8000-00000000000a','person','sub','Pete Survivor','(612) 555-0801','pete@rusk.test','a0000000-0000-0000-0000-000000000004','2025-01-01'),
  ('fb100000-0000-4000-8000-000000000002','fb000000-0000-4000-8000-00000000000a','person','sub','Pete Duplicate','(612) 555-0802','pete@rusk.test','a0000000-0000-0000-0000-000000000004','2026-01-01');

-- The duplicate's number said STOP. The record is keyed on the VALUE, per studio.
INSERT INTO public.studio_channel_consent
  (organization_id, channel_kind, channel_value, status, opt_out_at, opt_out_source)
VALUES ('fb000000-0000-4000-8000-00000000000a','sms','+16125550802','opted_out', now() - interval '30 days', 'inbound_sms')
ON CONFLICT (organization_id, channel_kind, channel_value) DO UPDATE
  SET status = 'opted_out', opt_out_at = EXCLUDED.opt_out_at;

DO $$
DECLARE w_s text; w_d text; w_after text; n int; v text[];
BEGIN
  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000004');

  w_s := public.identity_consent_status('fb000000-0000-4000-8000-00000000000a','fb100000-0000-4000-8000-000000000001','+16125550801');
  w_d := public.identity_consent_status('fb000000-0000-4000-8000-00000000000a','fb100000-0000-4000-8000-000000000002','+16125550802');
  RAISE NOTICE 'G survivor consent BEFORE: %   duplicate consent BEFORE: %', w_s, w_d;

  SELECT count(*) INTO n FROM public.studio_contact_channels
   WHERE owner_id = 'fb100000-0000-4000-8000-000000000002';
  RAISE NOTICE 'G the duplicate card holds % typed channel row(s) before the merge', n;

  PERFORM public.merge_studio_contacts(
    'fb100000-0000-4000-8000-000000000001','fb100000-0000-4000-8000-000000000002','email');

  w_after := public.identity_consent_status('fb000000-0000-4000-8000-00000000000a','fb100000-0000-4000-8000-000000000001','+16125550801');
  RAISE NOTICE 'G survivor consent AFTER the merge: %  (the opted-out number is now a channel on this card)', w_after;

  SELECT array_agg(value ORDER BY value) INTO v FROM public.studio_contact_channels
   WHERE owner_id = 'fb100000-0000-4000-8000-000000000001';
  RAISE NOTICE 'G the survivor''s typed channels after the merge: %', v;

  SELECT array_agg(x ORDER BY x) INTO v
    FROM public.identity_phone_numbers('fb000000-0000-4000-8000-00000000000a','fb100000-0000-4000-8000-000000000001','+16125550801') x;
  RAISE NOTICE 'G identity_phone_numbers() answers: %', v;

  -- preferred markers
  SELECT count(*) INTO n FROM public.studio_contact_channels
   WHERE owner_id = 'fb100000-0000-4000-8000-000000000001' AND preferred;
  RAISE NOTICE 'G preferred channel rows on the survivor after the merge: %', n;

  PERFORM pg_temp.reset_role();
END $$;

-- ── H: add_household_member against a project in ANOTHER studio ───────────
INSERT INTO public.studio_contacts
  (id, organization_id, entity_kind, contact_kind, full_name, created_by) VALUES
  ('fb100000-0000-4000-8000-00000000000a','fb000000-0000-4000-8000-00000000000a','person','client','Chidi P401','a0000000-0000-0000-0000-000000000004');
INSERT INTO public.client_households
  (id, organization_id, designer_id, display_name, member_person_ids, primary_member_person_id, co_threshold_cents, created_by)
VALUES ('fb300000-0000-4000-8000-000000000001','fb000000-0000-4000-8000-00000000000a',
        'a0000000-0000-0000-0000-000000000004','P401 household',
        ARRAY['fb100000-0000-4000-8000-00000000000a']::uuid[],
        'fb100000-0000-4000-8000-00000000000a', 250000,'a0000000-0000-0000-0000-000000000004');

DO $$
DECLARE v uuid; n int;
BEGIN
  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000004');
  BEGIN
    -- the Okonkwo residence belongs to b0000000-…-0001, not to P401 Studio A
    v := public.add_household_member('fb300000-0000-4000-8000-000000000001',
                                     'fb100000-0000-4000-8000-00000000000a',
                                     'client_rep',
                                     'd0e00000-0000-0000-0000-00000000000a');
    RAISE NOTICE 'H a seat was opened on ANOTHER studio''s project: %', v;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'H cross-studio seat REFUSED -> %', SQLERRM;
  END;
  PERFORM pg_temp.reset_role();
END $$;

ROLLBACK;
