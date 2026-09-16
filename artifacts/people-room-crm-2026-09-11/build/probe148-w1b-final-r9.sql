\pset pager off
BEGIN;
CREATE OR REPLACE FUNCTION pg_temp.assume_user(p uuid) RETURNS void AS $$
BEGIN PERFORM set_config('role','authenticated',true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub',p::text,'role','authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated'; END; $$ LANGUAGE plpgsql;
CREATE OR REPLACE FUNCTION pg_temp.reset_role() RETURNS void AS $$
BEGIN EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims',NULL,true); END; $$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION pg_temp.assume_user(uuid) TO PUBLIC;
GRANT EXECUTE ON FUNCTION pg_temp.reset_role() TO PUBLIC;

-- Z = client@patina.dev: plain member of the designer's SECOND design studio only
INSERT INTO organization_members (user_id, organization_id, role, status, joined_at)
VALUES ('a0000000-0000-0000-0000-000000000005','76db060f-0654-4502-94b1-00000c4e8dd3','member','active',now())
ON CONFLICT (user_id, organization_id) DO UPDATE SET role='member', status='active';

-- Y = manufacturer@patina.dev: member of a MANUFACTURER org that also holds the designer
INSERT INTO organizations (id, type, name, slug, status)
VALUES ('e9000000-0000-4000-8000-000000000001','manufacturer','Probe Mfg 148','probe-mfg-148','active');
INSERT INTO organization_members (user_id, organization_id, role, status, joined_at) VALUES
  ('a0000000-0000-0000-0000-000000000006','e9000000-0000-4000-8000-000000000001','member','active',now()),
  ('a0000000-0000-0000-0000-000000000004','e9000000-0000-4000-8000-000000000001','member','active',now());

-- X = support@patina.dev: owner of a wholly unrelated design studio
INSERT INTO organizations (id, type, name, slug, status)
VALUES ('e9000000-0000-4000-8000-000000000002','design_studio','Probe Unrelated 148','probe-unrel-148','active');
INSERT INTO organization_members (user_id, organization_id, role, status, joined_at) VALUES
  ('a0000000-0000-0000-0000-000000000007','e9000000-0000-4000-8000-000000000002','owner','active',now());

\echo '### PREMISE ###'
SELECT pg_temp.reset_role();
SELECT 'Z in local dev studio?' q, public.is_active_studio_member('b0000000-0000-0000-0000-000000000001') v;
SELECT pg_temp.assume_user('a0000000-0000-0000-0000-000000000005');
SELECT 'Z is_active_studio_member(LocalDev)' q, public.is_active_studio_member('b0000000-0000-0000-0000-000000000001')::text v
UNION ALL SELECT 'Z is_studio_comember(designer)', public.is_studio_comember('a0000000-0000-0000-0000-000000000004')::text
UNION ALL SELECT 'Z is_design_studio_comember(designer)', public.is_design_studio_comember('a0000000-0000-0000-0000-000000000004')::text
UNION ALL SELECT 'Z project_tenant_org(Aspen studio-less)', COALESCE(public.project_tenant_org('b0000000-0000-0000-0000-0000000000d1')::text,'<null>')
UNION ALL SELECT 'Z project_recorded_studio(Aspen)', COALESCE(public.project_recorded_studio('b0000000-0000-0000-0000-0000000000d1')::text,'<null>')
UNION ALL SELECT 'Z project_recorded_studio(Okonkwo)', COALESCE(public.project_recorded_studio('d0e00000-0000-0000-0000-00000000000a')::text,'<null>')
UNION ALL SELECT 'Z project_designer(Okonkwo)', COALESCE(public.project_designer('d0e00000-0000-0000-0000-00000000000a')::text,'<null>');
SELECT pg_temp.reset_role();

\echo '### A. every new object, platform-wide, per actor ###'
DO $$
DECLARE a record; n1 int; n2 int; n3 int; n4 int; n5 int; n6 int;
BEGIN
  FOR a IN SELECT * FROM (VALUES
      ('Z second design studio','a0000000-0000-0000-0000-000000000005'::uuid),
      ('Y manufacturer co-member','a0000000-0000-0000-0000-000000000006'::uuid),
      ('X unrelated studio owner','a0000000-0000-0000-0000-000000000007'::uuid),
      ('OWNER of the studio doing the work','a0000000-0000-0000-0000-000000000004'::uuid),
      ('ADMIN of the studio doing the work','a0000000-0000-0000-0000-000000000003'::uuid)
    ) v(lbl,uid) LOOP
    PERFORM pg_temp.assume_user(a.uid);
    SELECT count(*) INTO n1 FROM public.project_site_access_cards;
    SELECT count(*) INTO n2 FROM public.project_party_authority;
    SELECT count(*) INTO n3 FROM public.studio_compliance_documents;
    SELECT count(*) INTO n4 FROM public.people_directory_seats;
    SELECT count(*) INTO n5 FROM public.people_directory;
    SELECT count(*) INTO n6 FROM public.v_access_grants;
    PERFORM pg_temp.reset_role();
    RAISE NOTICE '% | cards=% grants=% docs=% seats=% directory=% access_grants=%',
      rpad(a.lbl,36), n1, n2, n3, n4, n5, n6;
  END LOOP;
END $$;

\echo '### B. the four definer readers, per actor (row counts) ###'
DO $$
DECLARE a record; r1 int; r2 int; r3 int; r4 int;
BEGIN
  FOR a IN SELECT * FROM (VALUES
      ('Z second design studio','a0000000-0000-0000-0000-000000000005'::uuid),
      ('Y manufacturer co-member','a0000000-0000-0000-0000-000000000006'::uuid),
      ('X unrelated studio owner','a0000000-0000-0000-0000-000000000007'::uuid),
      ('OWNER studio doing the work','a0000000-0000-0000-0000-000000000004'::uuid)
    ) v(lbl,uid) LOOP
    PERFORM pg_temp.assume_user(a.uid);
    SELECT count(*) INTO r1 FROM public.access_grants_trade_rfq();
    SELECT count(*) INTO r2 FROM public.access_grants_trade_agreement_links();
    SELECT count(*) INTO r3 FROM public.access_grants_plan_transmittals();
    SELECT count(*) INTO r4 FROM public.access_grants_invoice_links();
    PERFORM pg_temp.reset_role();
    RAISE NOTICE '% | rfq=% agreement=% plan=% invoice=%', rpad(a.lbl,32), r1, r2, r3, r4;
  END LOOP;
END $$;

\echo '### C. identity_* functions naming a FOREIGN org and naming OWN org with a FOREIGN key ###'
DO $$
DECLARE a record; dana uuid; nums text; word text; ev text;
BEGIN
  SELECT id INTO dana FROM public.studio_contacts
   WHERE full_name = 'Dana Kowalski' AND organization_id='b0000000-0000-0000-0000-000000000001';
  RAISE NOTICE 'Dana card = %', dana;
  FOR a IN SELECT * FROM (VALUES
      ('Z own org=LeahHartwell','a0000000-0000-0000-0000-000000000005'::uuid,'76db060f-0654-4502-94b1-00000c4e8dd3'::uuid),
      ('Y own org=Probe Mfg','a0000000-0000-0000-0000-000000000006'::uuid,'e9000000-0000-4000-8000-000000000001'::uuid),
      ('X own org=Probe Unrelated','a0000000-0000-0000-0000-000000000007'::uuid,'e9000000-0000-4000-8000-000000000002'::uuid),
      ('OWNER own org=LocalDev','a0000000-0000-0000-0000-000000000004'::uuid,'b0000000-0000-0000-0000-000000000001'::uuid)
    ) v(lbl,uid,org) LOOP
    PERFORM pg_temp.assume_user(a.uid);
    SELECT COALESCE(string_agg(n,','),'<none>') INTO nums
      FROM public.identity_phone_numbers(a.org, dana::text, NULL) n;
    SELECT COALESCE(public.identity_consent_status(a.org, dana::text, NULL),'<null>') INTO word;
    SELECT COALESCE(string_agg(format('%s/%s/%s', channel_value, consented_at, opt_out_at),' '),'<none>') INTO ev
      FROM public.identity_consent_evidence(a.org, dana::text, NULL);
    PERFORM pg_temp.reset_role();
    RAISE NOTICE '% | own-org numbers=% word=% evidence=%', rpad(a.lbl,26), nums, word, ev;
    PERFORM pg_temp.assume_user(a.uid);
    SELECT COALESCE(string_agg(n,','),'<none>') INTO nums
      FROM public.identity_phone_numbers('b0000000-0000-0000-0000-000000000001', dana::text, NULL) n;
    SELECT COALESCE(public.identity_consent_status('b0000000-0000-0000-0000-000000000001', dana::text, NULL),'<null>') INTO word;
    PERFORM pg_temp.reset_role();
    RAISE NOTICE '% | naming LOCALDEV  numbers=% word=%', rpad(a.lbl,26), nums, word;
  END LOOP;
END $$;

\echo '### D. can Z change the lockbox version or plant a grant? ###'
SELECT pg_temp.assume_user('a0000000-0000-0000-0000-000000000005');
UPDATE public.project_site_access_cards SET lockbox_version='Z WAS HERE';
SELECT 'Z site-card rows visible' q, count(*)::text v FROM public.project_site_access_cards;
SELECT pg_temp.reset_role();
SELECT 'stored lockbox_version after Z' q, lockbox_version v FROM public.project_site_access_cards;

ROLLBACK;
