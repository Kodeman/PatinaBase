\set ON_ERROR_STOP on
BEGIN;
-- resolve the designer's SECOND design studio (not Local Dev Studio) dynamically:
-- the Leah Hartwell org is re-minted with a fresh uuid on every reset.
SELECT om.organization_id AS other_org FROM public.organization_members om
  JOIN public.organizations o ON o.id = om.organization_id
 WHERE om.user_id='a0000000-0000-0000-0000-000000000004' AND om.status='active'
   AND o.type='design_studio' AND o.status='active'
   AND om.organization_id <> 'b0000000-0000-0000-0000-000000000001'
 LIMIT 1 \gset

SELECT 'the two studios of one designer' AS leg,
       'b0000000-0000-0000-0000-000000000001'::uuid AS working_studio,
       :'other_org'::uuid AS other_studio,
       (SELECT name FROM organizations WHERE id=:'other_org') AS other_name;

INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password,
                        email_confirmed_at, created_at, updated_at)
VALUES ('c8000000-0000-4000-8000-0000000000a1'::uuid,'00000000-0000-0000-0000-000000000000',
        'authenticated','authenticated','r8-other-studio@patina.invalid','x', now(), now(), now());
INSERT INTO public.profiles (id, email, full_name)
VALUES ('c8000000-0000-4000-8000-0000000000a1','r8-other-studio@patina.invalid','R8 Other Studio Member')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.organization_members (user_id, organization_id, role, status, joined_at)
VALUES ('c8000000-0000-4000-8000-0000000000a1', :'other_org', 'member','active', now());

-- the working studio's own facts, on a project that records NO studio
INSERT INTO public.project_parties (id, project_id, party_kind, display_name, phone_e164, trade, stage, created_by)
VALUES ('c8000000-0000-4000-8000-0000000000b1','b0000000-0000-0000-0000-0000000000d1','sub',
        'R8 Studioless Trade','+16125557001','electrical','active','a0000000-0000-0000-0000-000000000004');
INSERT INTO public.project_site_access_cards (project_id, lockbox_version, alarm_ref,
       key_holder_engagement_id, site_hours, emergency_lines, created_by)
VALUES ('b0000000-0000-0000-0000-0000000000d1','third code, changed 16 Oct','ALARM-ACCT-99812',
        'c8000000-0000-4000-8000-0000000000b1','07:00-17:00 weekdays',
        '[{"label":"gas","name":"CenterPoint","phone":"+16125550911"}]'::jsonb,
        'a0000000-0000-0000-0000-000000000004');
INSERT INTO public.project_party_authority (engagement_id, scope, threshold_cents, granted_by)
VALUES ('c8000000-0000-4000-8000-0000000000b1','money',250000,'a0000000-0000-0000-0000-000000000004');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  '{"sub":"c8000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);

SELECT 'PREMISE: X is in the OTHER studio only' AS leg,
       public.is_active_studio_member('b0000000-0000-0000-0000-000000000001') AS in_working_studio,
       public.is_active_studio_member(:'other_org') AS in_other_studio,
       public.project_tenant_org('b0000000-0000-0000-0000-0000000000d1') AS tenant_org_X_resolves,
       public.is_active_studio_member(public.project_tenant_org('b0000000-0000-0000-0000-0000000000d1')) AS gate_passes;

SELECT 'A. site access card READ, as X' AS leg, lockbox_version, alarm_ref, site_hours, emergency_lines
  FROM public.project_site_access_cards WHERE project_id='b0000000-0000-0000-0000-0000000000d1';
UPDATE public.project_site_access_cards SET lockbox_version='CHANGED BY THE OTHER STUDIO'
 WHERE project_id='b0000000-0000-0000-0000-0000000000d1';
SELECT 'B. site access card WRITE, as X' AS leg, lockbox_version
  FROM public.project_site_access_cards WHERE project_id='b0000000-0000-0000-0000-0000000000d1';
SELECT 'C. money authority grant, as X' AS leg, scope, threshold_cents
  FROM public.project_party_authority WHERE engagement_id='c8000000-0000-4000-8000-0000000000b1';
SELECT 'D. seats view + directory row, as X' AS leg,
  (SELECT count(*) FROM public.people_directory_seats WHERE seat_id='c8000000-0000-4000-8000-0000000000b1') AS seat_rows,
  (SELECT count(*) FROM public.people_directory WHERE person_id='c8000000-0000-4000-8000-0000000000b1') AS directory_rows;
SELECT 'E. identity_phone_numbers naming X''s OWN org' AS leg,
  array(SELECT * FROM public.identity_phone_numbers(:'other_org','+16125557001',NULL)) AS number_set;
SELECT 'F. CONTROL — the same objects on a project that RECORDS the working studio' AS leg,
  (SELECT count(*) FROM public.project_site_access_cards WHERE project_id='d0e00000-0000-0000-0000-00000000000a') AS site_cards,
  (SELECT count(*) FROM public.people_directory_seats WHERE project_id='d0e00000-0000-0000-0000-00000000000a') AS seats;
SELECT 'G. v_project_roster consent word on the RECORDED project, as X' AS leg, display_name, sms_consent_status
  FROM public.v_project_roster
 WHERE project_id='d0e00000-0000-0000-0000-00000000000a' AND display_name IN ('Pete Rusk','Ngozi Eze','Joe Wozniak')
 ORDER BY display_name;
RESET ROLE;
SELECT 'H. what the record at the working studio actually says' AS leg, channel_value, status, opt_out_at
  FROM public.studio_channel_consent
 WHERE organization_id='b0000000-0000-0000-0000-000000000001' AND channel_value IN ('+16125550112','+16125550106','+16125550118')
 ORDER BY channel_value;
ROLLBACK;
