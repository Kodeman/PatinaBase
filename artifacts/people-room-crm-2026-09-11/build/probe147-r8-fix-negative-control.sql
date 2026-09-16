-- probe147 — w1b final review r8 fix: the negative control for BLOCKING-1 and
-- MAJOR-1, run as probe144's own walk against the fixed objects.
--   BLOCKING-1: a plain member of the designer's SECOND design studio must
--               read 0 site access cards and 0 authority grants on a
--               studio-less job, and change no lockbox version.
--   MAJOR-1:    v_project_roster must print NULL, never `not_asked`, over a
--               record that caller cannot read.
-- Plus the positive controls: the working studio's admin still reads the card,
-- the grant and the refusal where the record names its studio.
\set ON_ERROR_STOP on
BEGIN;
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
       public.is_active_studio_member(public.project_tenant_org('b0000000-0000-0000-0000-0000000000d1')) AS old_gate_still_passes,
       public.project_recorded_studio('b0000000-0000-0000-0000-0000000000d1') AS recorded_studio,
       public.is_active_studio_member(public.project_recorded_studio('b0000000-0000-0000-0000-0000000000d1')) AS new_gate_passes;

SELECT 'A. site access card READ, as X' AS leg, count(*) AS cards
  FROM public.project_site_access_cards WHERE project_id='b0000000-0000-0000-0000-0000000000d1';
SELECT 'A2. site access cards anywhere, as X' AS leg, count(*) AS cards
  FROM public.project_site_access_cards;
UPDATE public.project_site_access_cards SET lockbox_version='CHANGED BY THE OTHER STUDIO'
 WHERE project_id='b0000000-0000-0000-0000-0000000000d1';
SELECT 'B. site access card WRITE, as X — rows changed' AS leg, count(*) AS rows_visible_after
  FROM public.project_site_access_cards WHERE lockbox_version='CHANGED BY THE OTHER STUDIO';
SELECT 'C. money authority grant, as X' AS leg, count(*) AS grants
  FROM public.project_party_authority WHERE engagement_id='c8000000-0000-4000-8000-0000000000b1';
SELECT 'D. RESIDUE (deliberate, r6/r7): seats view + directory row, as X' AS leg,
  (SELECT count(*) FROM public.people_directory_seats WHERE seat_id='c8000000-0000-4000-8000-0000000000b1') AS seat_rows,
  (SELECT count(*) FROM public.people_directory WHERE person_id='c8000000-0000-4000-8000-0000000000b1') AS directory_rows,
  (SELECT consent_status FROM public.people_directory_seats WHERE seat_id='c8000000-0000-4000-8000-0000000000b1') AS seat_consent_word;
SELECT 'E. identity_phone_numbers naming X''s OWN org (unchanged by design)' AS leg,
  array(SELECT * FROM public.identity_phone_numbers(:'other_org','+16125557001',NULL)) AS number_set;
SELECT 'G. v_project_roster consent word on the RECORDED project, as X' AS leg, display_name, sms_consent_status
  FROM public.v_project_roster
 WHERE project_id='d0e00000-0000-0000-0000-00000000000a' AND display_name IN ('Pete Rusk','Ngozi Eze','Joe Wozniak')
 ORDER BY display_name;

-- the positive controls, as the ADMIN of the studio doing the work
SELECT set_config('request.jwt.claims',
  '{"sub":"a0000000-0000-0000-0000-000000000003","role":"authenticated"}', true);
SELECT 'P1. admin of the working studio, on the job that RECORDS it' AS leg,
  (SELECT count(*) FROM public.project_site_access_cards WHERE project_id='d0e00000-0000-0000-0000-00000000000a') AS cards,
  (SELECT count(*) FROM public.project_party_authority a JOIN public.project_parties pp ON pp.id=a.engagement_id
    WHERE pp.project_id='d0e00000-0000-0000-0000-00000000000a') AS grants,
  (SELECT count(*) FROM public.people_directory_seats WHERE project_id='d0e00000-0000-0000-0000-00000000000a') AS seats;
SELECT 'P2. and the refusal still reads as the refusal' AS leg, display_name, sms_consent_status
  FROM public.v_project_roster
 WHERE project_id='d0e00000-0000-0000-0000-00000000000a' AND display_name IN ('Pete Rusk','Ngozi Eze','Joe Wozniak')
 ORDER BY display_name;
SELECT 'P3. the studio-less job costs the working studio these two too' AS leg,
  (SELECT count(*) FROM public.project_site_access_cards WHERE project_id='b0000000-0000-0000-0000-0000000000d1') AS cards,
  (SELECT count(*) FROM public.project_party_authority WHERE engagement_id='c8000000-0000-4000-8000-0000000000b1') AS grants,
  (SELECT count(*) FROM public.people_directory_seats WHERE seat_id='c8000000-0000-4000-8000-0000000000b1') AS seat_rows;

RESET ROLE;
SELECT 'H. what the record at the working studio actually says' AS leg, channel_value, status, opt_out_at
  FROM public.studio_channel_consent
 WHERE organization_id='b0000000-0000-0000-0000-000000000001' AND channel_value IN ('+16125550112','+16125550106','+16125550118')
 ORDER BY channel_value;
SELECT 'I. and the stored lockbox version is untouched' AS leg, lockbox_version
  FROM public.project_site_access_cards WHERE project_id='b0000000-0000-0000-0000-0000000000d1';
ROLLBACK;
