-- Adversarial close-review probes (r1). Objects/behaviour only; ROLLBACKed.
BEGIN;

INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
VALUES
  ('f0000000-0000-4000-8000-000000000001','cr-designer@test.invalid','',NOW(),NOW(),NOW(),'00000000-0000-0000-0000-000000000000','authenticated','authenticated'),
  ('f0000000-0000-4000-8000-000000000002','cr-member-a@test.invalid','',NOW(),NOW(),NOW(),'00000000-0000-0000-0000-000000000000','authenticated','authenticated'),
  ('f0000000-0000-4000-8000-000000000003','cr-member-b@test.invalid','',NOW(),NOW(),NOW(),'00000000-0000-0000-0000-000000000000','authenticated','authenticated');

INSERT INTO organizations (id,type,name,slug,status,created_at,updated_at) VALUES
  ('f1000000-0000-4000-8000-00000000000a','design_studio','CR Alpha','cr-alpha','active',NOW(),NOW()),
  ('f1000000-0000-4000-8000-00000000000b','design_studio','CR Beta','cr-beta','active',NOW(),NOW());

-- owners first (guard_org_membership_changes), then the plain members.
INSERT INTO organization_members (user_id,organization_id,role,status,joined_at,created_at,updated_at) VALUES
  ('f0000000-0000-4000-8000-000000000002','f1000000-0000-4000-8000-00000000000a','owner','active',NOW(),NOW(),NOW());
INSERT INTO organization_members (user_id,organization_id,role,status,joined_at,created_at,updated_at) VALUES
  ('f0000000-0000-4000-8000-000000000001','f1000000-0000-4000-8000-00000000000b','owner','active',NOW()-interval '1 year',NOW(),NOW());
INSERT INTO organization_members (user_id,organization_id,role,status,joined_at,created_at,updated_at) VALUES
  ('f0000000-0000-4000-8000-000000000001','f1000000-0000-4000-8000-00000000000a','member','active',NOW()-interval '2 year',NOW(),NOW()),
  ('f0000000-0000-4000-8000-000000000003','f1000000-0000-4000-8000-00000000000b','member','active',NOW(),NOW(),NOW());

-- A project with NO studio_id: the population the inlined fallback exists for.
INSERT INTO projects (id,name,designer_id,studio_id,created_by,status,created_at,updated_at) VALUES
  ('f2000000-0000-4000-8000-00000000000a','CR nullstudio job','f0000000-0000-4000-8000-000000000001',NULL,'f0000000-0000-4000-8000-000000000001','active',NOW(),NOW());
UPDATE projects SET studio_id = NULL WHERE id='f2000000-0000-4000-8000-00000000000a';

INSERT INTO project_parties (id,project_id,party_kind,display_name,phone,sms_consent_status)
VALUES ('f3000000-0000-4000-8000-00000000000a','f2000000-0000-4000-8000-00000000000a','sub','Ray Thao','+16125559001','not_asked');

-- The studio the SEND GATE will resolve for this job records a STOP.
SELECT set_config('request.jwt.claims', json_build_object('sub','f0000000-0000-4000-8000-000000000001','role','authenticated')::text, true) IS NOT NULL AS claims_set;
SET LOCAL ROLE authenticated;
SELECT public.record_channel_consent(
  'f1000000-0000-4000-8000-00000000000b','sms','+16125559001','opted_out',
  'inbound_sms','Replied STOP', NULL, NULL) IS NOT NULL AS recorded;
RESET ROLE;
SELECT set_config('request.jwt.claims', NULL, true) IS NULL AS cleared;

\echo ''
\echo '=== P1a. org resolved by the DEFINER path (backfill / RPC / send rail) ==='
SELECT public._primary_studio_for('f0000000-0000-4000-8000-000000000001') AS definer_org,
       'f1000000-0000-4000-8000-00000000000b'::uuid AS beta;
SELECT studio_id FROM projects WHERE id='f2000000-0000-4000-8000-00000000000a';

\echo '=== P1b. org resolved by the INLINED subquery in the views, per caller ==='
SELECT set_config('request.jwt.claims', json_build_object('sub','f0000000-0000-4000-8000-000000000002','role','authenticated')::text, true) IS NOT NULL AS claims_set;
SET LOCAL ROLE authenticated;
SELECT 'alpha member' AS caller,
       (SELECT om2.organization_id FROM public.organization_members om2
          JOIN public.organizations o2 ON o2.id = om2.organization_id
         WHERE om2.user_id = 'f0000000-0000-4000-8000-000000000001'
           AND om2.status='active' AND o2.type='design_studio'
         ORDER BY (om2.role='owner') DESC, om2.joined_at NULLS LAST, om2.created_at
         LIMIT 1) AS inlined_org;
SELECT display_name, sms_consent_status FROM public.v_project_roster
 WHERE roster_id='f3000000-0000-4000-8000-00000000000a';
RESET ROLE;

SELECT set_config('request.jwt.claims', json_build_object('sub','f0000000-0000-4000-8000-000000000003','role','authenticated')::text, true) IS NOT NULL AS claims_set;
SET LOCAL ROLE authenticated;
SELECT 'beta member' AS caller,
       (SELECT om2.organization_id FROM public.organization_members om2
          JOIN public.organizations o2 ON o2.id = om2.organization_id
         WHERE om2.user_id = 'f0000000-0000-4000-8000-000000000001'
           AND om2.status='active' AND o2.type='design_studio'
         ORDER BY (om2.role='owner') DESC, om2.joined_at NULLS LAST, om2.created_at
         LIMIT 1) AS inlined_org;
SELECT display_name, sms_consent_status FROM public.v_project_roster
 WHERE roster_id='f3000000-0000-4000-8000-00000000000a';
RESET ROLE;
SELECT set_config('request.jwt.claims', NULL, true) IS NULL AS cleared;

\echo ''
\echo '=== P2. the fold, and an inbound_sms GRANT left standing on a STOP-flipped seat ==='
INSERT INTO projects (id,name,designer_id,studio_id,created_by,status,created_at,updated_at) VALUES
  ('f2000000-0000-4000-8000-00000000000c','CR alpha job','f0000000-0000-4000-8000-000000000002','f1000000-0000-4000-8000-00000000000a','f0000000-0000-4000-8000-000000000002','active',NOW(),NOW());
INSERT INTO project_parties (id,project_id,party_kind,display_name,phone,
  sms_consent_status,sms_consented_at,sms_opt_out_at,sms_consent_source,
  sms_consent_evidence,sms_consent_recorded_at,sms_consent_disclosure_version,sms_consent_recorded_by)
VALUES ('f3000000-0000-4000-8000-00000000000c','f2000000-0000-4000-8000-00000000000c','sub','Pete Rusk','+16125559002',
  'opted_out','2025-03-01T00:00:00Z','2025-12-03T00:00:00Z','inbound_sms',
  'Inbound YES','2025-03-01T00:00:00Z','field-sms-v1','f0000000-0000-4000-8000-000000000002');
SELECT public.backfill_channel_consent_from_parties() AS folded;
SELECT status, opt_out_at, opt_out_source, opt_out_evidence, opt_out_recorded_at,
       opt_out_recorded_by IS NOT NULL AS opt_out_recorded_by_set,
       source, evidence, consented_at
  FROM public.studio_channel_consent WHERE channel_value='+16125559002';

\echo ''
\echo '=== P3. does an opted_out MINT write the GRANT-side five columns? ==='
SELECT set_config('request.jwt.claims', json_build_object('sub','f0000000-0000-4000-8000-000000000002','role','authenticated')::text, true) IS NOT NULL AS claims_set;
SET LOCAL ROLE authenticated;
SELECT public.record_channel_consent(
  'f1000000-0000-4000-8000-00000000000a','sms','+16125559003','opted_out',
  'verbal','He told me on site', NULL, NULL) IS NOT NULL AS recorded;
RESET ROLE;
SELECT set_config('request.jwt.claims', NULL, true) IS NULL AS cleared;
SELECT status, source, evidence, recorded_at IS NOT NULL AS recorded_at_set,
       consented_at, opt_out_source, opt_out_evidence
  FROM public.studio_channel_consent WHERE channel_value='+16125559003';

\echo ''
\echo '=== P4. the shipped portal consent write (useRecordPartySmsConsent shape) ==='
DO $p4$
DECLARE r TEXT;
BEGIN
  BEGIN
    UPDATE public.project_parties
       SET sms_consent_status='pending', sms_consent_source='written',
           sms_consent_evidence='kickoff form', sms_consent_recorded_at=now(),
           sms_consent_disclosure_version='field-sms-v1'
     WHERE id='f3000000-0000-4000-8000-00000000000a';
    r := 'WROTE (no refusal)';
  EXCEPTION WHEN OTHERS THEN r := 'raised ' || SQLERRM;
  END;
  RAISE NOTICE 'P4 portal pending write: %', r;
END $p4$;

\echo ''
\echo '=== P5. table RLS + grants ==='
SELECT relname, relrowsecurity, relacl::text FROM pg_class
 WHERE relname IN ('studio_channel_consent','studio_contact_channels',
                   'studio_person_affiliations','studio_contact_rules');
SELECT p.proname, p.prosecdef, p.proacl::text FROM pg_proc p
  JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.proname IN
  ('record_channel_consent','record_channel_reconsent','channel_consent_status',
   'backfill_channel_consent_from_parties','refuse_legacy_consent_write',
   'normalize_channel_value','studio_contact_org','project_party_designer',
   'channel_value_was_on_sms_rail','assert_studio_contact_identity_stable')
 ORDER BY 1;

\echo ''
\echo '=== P6. can an authenticated member write the consent table directly? ==='
SELECT set_config('request.jwt.claims', json_build_object('sub','f0000000-0000-4000-8000-000000000002','role','authenticated')::text, true) IS NOT NULL AS claims_set;
SET LOCAL ROLE authenticated;
DO $p6$
DECLARE r TEXT; n INT;
BEGIN
  BEGIN
    UPDATE public.studio_channel_consent SET status='granted'
     WHERE organization_id='f1000000-0000-4000-8000-00000000000a';
    GET DIAGNOSTICS n = ROW_COUNT;
    r := 'UPDATE returned, rows=' || n;
  EXCEPTION WHEN OTHERS THEN r := 'raised ' || SQLERRM;
  END;
  RAISE NOTICE 'P6 direct UPDATE by member: %', r;
  BEGIN
    INSERT INTO public.studio_channel_consent (organization_id, channel_kind, channel_value, status)
    VALUES ('f1000000-0000-4000-8000-00000000000a','sms','+16125559009','granted');
    r := 'INSERT allowed';
  EXCEPTION WHEN OTHERS THEN r := 'raised ' || SQLERRM;
  END;
  RAISE NOTICE 'P6 direct INSERT by member: %', r;
END $p6$;
RESET ROLE;
SELECT set_config('request.jwt.claims', NULL, true) IS NULL AS cleared;

\echo ''
\echo '=== P7. project_parties triggers ==='
SELECT tgname, pg_get_triggerdef(oid) FROM pg_trigger
 WHERE tgrelid='public.project_parties'::regclass AND NOT tgisinternal ORDER BY tgname;

ROLLBACK;
