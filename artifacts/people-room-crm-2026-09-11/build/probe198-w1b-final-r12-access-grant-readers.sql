\pset pager off
BEGIN;
SET LOCAL client_min_messages=notice;
DO $$
DECLARE v_z uuid := gen_random_uuid(); v_leah uuid := '5996ea1d-7e47-4582-a18a-7e5bda9ace5f';
        v_mfr uuid; v_m uuid := gen_random_uuid(); n int; d uuid;
BEGIN
  SELECT id INTO d FROM public.profiles WHERE email='designer@patina.dev';
  INSERT INTO auth.users (id, email, aud, role, instance_id, encrypted_password, email_confirmed_at, created_at, updated_at)
  VALUES (v_z,'z3-r12@probe.test','authenticated','authenticated','00000000-0000-0000-0000-000000000000','x',now(),now(),now());
  INSERT INTO public.organization_members (organization_id, user_id, role, status) VALUES (v_leah, v_z, 'member','active');

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub',v_z::text,'role','authenticated')::text, true);
  SELECT count(*) INTO n FROM public.field_link_tokens;            RAISE NOTICE 'Z: raw field_link_tokens (shipped RLS) = %', n;
  SELECT count(*) INTO n FROM public.v_access_grants WHERE tier='field_link'; RAISE NOTICE 'Z: v_access_grants field_link = %', n;
  SELECT count(*) INTO n FROM public.access_grants_trade_rfq();               RAISE NOTICE 'Z: access_grants_trade_rfq() = %', n;
  SELECT count(*) INTO n FROM public.access_grants_plan_transmittals();       RAISE NOTICE 'Z: access_grants_plan_transmittals() = %', n;
  SELECT count(*) INTO n FROM public.access_grants_invoice_links();           RAISE NOTICE 'Z: access_grants_invoice_links() = %', n;
  SELECT count(*) INTO n FROM public.access_grants_trade_agreement_links();   RAISE NOTICE 'Z: access_grants_trade_agreement_links() = %', n;
  -- the RPC-shaped oracles
  SELECT count(*) INTO n FROM public.identity_phone_numbers('b0000000-0000-0000-0000-000000000001',
          (SELECT id::text FROM public.studio_contacts WHERE organization_id='b0000000-0000-0000-0000-000000000001' AND full_name='Dana Kowalski'), NULL);
  RAISE NOTICE 'Z: identity_phone_numbers(LDS, Dana card) = % numbers  (cross-tenant oracle?)', n;
  RESET ROLE;

  -- the working studio's own admin, as control
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub',d::text,'role','authenticated')::text, true);
  SELECT count(*) INTO n FROM public.access_grants_trade_rfq();             RAISE NOTICE 'LDS owner: trade_rfq = %', n;
  SELECT count(*) INTO n FROM public.access_grants_plan_transmittals();     RAISE NOTICE 'LDS owner: plan_transmittals = %', n;
  SELECT count(*) INTO n FROM public.access_grants_invoice_links();         RAISE NOTICE 'LDS owner: invoice_links = %', n;
  SELECT count(*) INTO n FROM public.v_access_grants;                        RAISE NOTICE 'LDS owner: v_access_grants = %', n;
  SELECT count(*) INTO n FROM public.v_access_grants WHERE grant_id ~ '[0-9a-f]{64}'; RAISE NOTICE 'LDS owner: grant_ids that look like a 64-hex credential = %', n;
  RESET ROLE;
END $$;
ROLLBACK;
