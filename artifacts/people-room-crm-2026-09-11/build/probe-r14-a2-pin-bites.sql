-- r14 probe A2: does the NEW block-10 pin actually bite?
--
-- One transaction, ROLLBACKed. Restores the PRE-FIX reduction (the six-column
-- SET list) by rewriting the live function definition in place, then replays
-- exactly the fixture and the assertion the SQL suite's block 10 now carries.
-- If the pin is real, the assertion must raise here and pass on the shipped
-- function (which the suite's own green run already shows).
BEGIN;
CREATE OR REPLACE FUNCTION pg_temp.assume_user(p_user_id UUID) RETURNS VOID AS $f$
BEGIN
  PERFORM set_config('role','authenticated',true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub',p_user_id::text,'role','authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
END; $f$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION pg_temp.assume_user(UUID) TO PUBLIC;

-- ── put the seventh column back out of the reduction ───────────────────────
DO $$
DECLARE def text; before_len integer;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO def
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'merge_studio_contacts';
  before_len := length(def);
  def := replace(def, '         sms_capable = s.sms_capable OR u.merged_sms_capable,' || chr(10), '');
  def := replace(def, '             mc.sms_capable  AS merged_sms_capable,' || chr(10), '');
  IF length(def) = before_len THEN
    RAISE EXCEPTION 'A2 SETUP FAIL: the reduction does not name sms_capable at all';
  END IF;
  EXECUTE def;
  RAISE NOTICE 'A2-a the pre-fix six-column reduction is installed for this transaction';
END $$;

INSERT INTO public.organizations (id, type, name, slug, status) VALUES
  ('fa142000-0000-4000-8000-00000000000a','design_studio','R14 A2 Studio','r14-a2-studio','active');
INSERT INTO public.organization_members (user_id, organization_id, role, status, joined_at) VALUES
  ('a0000000-0000-0000-0000-000000000004','fa142000-0000-4000-8000-00000000000a','owner','active',now())
ON CONFLICT (user_id, organization_id) DO UPDATE SET role='owner', status='active';

INSERT INTO public.studio_contacts
  (id, organization_id, entity_kind, contact_kind, full_name, created_by, created_at) VALUES
  ('fa142000-0000-4000-8000-000000000001','fa142000-0000-4000-8000-00000000000a','person','sub','A2 Older','a0000000-0000-0000-0000-000000000004','2024-01-01'),
  ('fa142000-0000-4000-8000-000000000002','fa142000-0000-4000-8000-00000000000a','person','sub','A2 Newer','a0000000-0000-0000-0000-000000000004','2026-01-01');

-- block 10's own r14 fixture shape: the email collision the r6 pin uses, plus
-- the three mobile rows the new pin adds.
INSERT INTO public.studio_contact_channels
  (owner_type, owner_id, channel_kind, value, status, status_at, verified, verified_at, preferred, label) VALUES
  ('person','fa142000-0000-4000-8000-000000000001','email','a2@example.invalid','active',      NULL,        false, NULL,        false, NULL),
  ('person','fa142000-0000-4000-8000-000000000002','email','a2@example.invalid','unsubscribed','2025-12-03', true,'2025-11-01', true, 'Shop address');
INSERT INTO public.studio_contact_channels
  (owner_type, owner_id, channel_kind, value, sms_capable) VALUES
  ('person','fa142000-0000-4000-8000-000000000001','mobile','+16125559941', false),
  ('person','fa142000-0000-4000-8000-000000000002','mobile','+16125559941', true),
  ('person','fa142000-0000-4000-8000-000000000001','mobile','+16125559943', true),
  ('person','fa142000-0000-4000-8000-000000000002','mobile','+16125559943', false),
  ('person','fa142000-0000-4000-8000-000000000001','mobile','+16125559942', true);

DO $$
DECLARE c public.studio_contact_channels%ROWTYPE; fired boolean := false;
BEGIN
  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000004');
  PERFORM public.merge_studio_contacts(
    'fa142000-0000-4000-8000-000000000001','fa142000-0000-4000-8000-000000000002','email');

  -- the r6 six columns still travel under the pre-fix body: the OLD pin is
  -- blind to the harm, which is why eleven rounds passed over it
  SELECT * INTO c FROM public.studio_contact_channels
   WHERE owner_id='fa142000-0000-4000-8000-000000000001' AND channel_kind='email';
  RAISE NOTICE 'A2-b the r6 pin''s own columns are unaffected: status=% verified=% preferred=% label=%',
    c.status, c.verified, c.preferred, c.label;

  -- the NEW pin's three assertions, verbatim in shape
  SELECT * INTO c FROM public.studio_contact_channels
   WHERE owner_id='fa142000-0000-4000-8000-000000000001'
     AND channel_kind='mobile' AND value='+16125559941';
  IF NOT c.sms_capable THEN
    fired := true;
    RAISE NOTICE 'A2-c PIN 1 FIRES: the fold destroyed sms_capable (survivor reads %)', c.sms_capable;
  ELSE
    RAISE NOTICE 'A2-c PIN 1 did NOT fire';
  END IF;

  SELECT * INTO c FROM public.studio_contact_channels
   WHERE owner_id='fa142000-0000-4000-8000-000000000001'
     AND channel_kind='mobile' AND value='+16125559943';
  RAISE NOTICE 'A2-d PIN 2 (survivor knew, absorbed did not) survivor reads %', c.sms_capable;

  SELECT * INTO c FROM public.studio_contact_channels
   WHERE owner_id='fa142000-0000-4000-8000-000000000001'
     AND channel_kind='mobile' AND value='+16125559942';
  RAISE NOTICE 'A2-e CONTROL (uncollided row) reads %', c.sms_capable;

  IF NOT fired THEN
    RAISE EXCEPTION 'A2 FAIL: the new pin does not bite — it would pass against the pre-fix body';
  END IF;
END $$;
ROLLBACK;
