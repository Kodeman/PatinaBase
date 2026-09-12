\pset pager off
\echo '=== B. PR-n as a plain MEMBER of the studio ==='
BEGIN;
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at,
                        raw_app_meta_data, raw_user_meta_data, aud, role)
VALUES ('dd000000-0000-0000-0000-0000000000a1','plainmember@example.test','x',now(),now(),now(),
        '{"provider":"email","providers":["email"]}','{}','authenticated','authenticated');
INSERT INTO organization_members (organization_id, user_id, role, status)
VALUES ('b0000000-0000-0000-0000-000000000001','dd000000-0000-0000-0000-0000000000a1','member','active');
INSERT INTO project_parties (id, project_id, party_kind, display_name, phone, phone_e164)
VALUES ('dd000000-0000-0000-0000-0000000000f1','d0e00000-0000-0000-0000-00000000000a','sub','PRN Probe','+16125557701','+16125557701');
SET LOCAL role authenticated;
SET LOCAL request.jwt.claims = '{"sub":"dd000000-0000-0000-0000-0000000000a1","role":"authenticated"}';
\echo '-- B1 selections (expect 1)'
INSERT INTO project_party_authority (id, engagement_id, scope)
VALUES ('dd000000-0000-0000-0000-0000000000b1','dd000000-0000-0000-0000-0000000000f1','selections');
\echo '-- B2 money (expect refused)'
SAVEPOINT s1;
INSERT INTO project_party_authority (engagement_id, scope, threshold_cents)
VALUES ('dd000000-0000-0000-0000-0000000000f1','money',250000);
ROLLBACK TO s1;
\echo '-- B3 escalate the selections grant to money (expect refused)'
SAVEPOINT s2;
UPDATE project_party_authority SET scope='money' WHERE id='dd000000-0000-0000-0000-0000000000b1';
ROLLBACK TO s2;
\echo '-- B4 change_order with a $5,000,000 threshold (PR-n permits the scope)'
INSERT INTO project_party_authority (engagement_id, scope, threshold_cents)
VALUES ('dd000000-0000-0000-0000-0000000000f1','change_order',500000000);
\echo '-- B5 DELETE an owner-set money grant (expect 0 rows deleted)'
RESET role;
INSERT INTO project_party_authority (id, engagement_id, scope, threshold_cents)
VALUES ('dd000000-0000-0000-0000-0000000000b9','dd000000-0000-0000-0000-0000000000f1','money',250000);
SET LOCAL role authenticated;
SET LOCAL request.jwt.claims = '{"sub":"dd000000-0000-0000-0000-0000000000a1","role":"authenticated"}';
DELETE FROM project_party_authority WHERE id='dd000000-0000-0000-0000-0000000000b9';
\echo '-- B6 can the member UPDATE the money grant threshold? (expect 0 rows)'
UPDATE project_party_authority SET threshold_cents=1 WHERE id='dd000000-0000-0000-0000-0000000000b9';
\echo '-- B7 can the member move the money grant to another seat? (engagement_id is not scope)'
UPDATE project_party_authority SET engagement_id='dd000000-0000-0000-0000-0000000000f1' WHERE id='dd000000-0000-0000-0000-0000000000b9';
ROLLBACK;

\echo '=== D. create_field_link on the seeded Lindqvist (closed job) seats ==='
BEGIN;
SET LOCAL role authenticated;
SET LOCAL request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-000000000004","role":"authenticated"}';
DO $$
DECLARE r record; t record; e timestamptz;
BEGIN
  FOR r IN SELECT id, display_name, stage, on_site_to, warranty_until FROM project_parties
            WHERE project_id='d0e00000-0000-0000-0000-00000000000b' AND on_site_to IS NOT NULL
            ORDER BY display_name LOOP
    SELECT * INTO t FROM public.create_field_link(r.id);
    SELECT expires_at INTO e FROM field_link_tokens WHERE id = t.id;
    RAISE NOTICE '% | stage=% | on_site_to=% | warranty_until=% | minted expiry=% | ALREADY DEAD: %',
      rpad(r.display_name,17), rpad(r.stage,9), r.on_site_to, r.warranty_until, e, (e <= now());
  END LOOP;
END $$;
ROLLBACK;

\echo '=== D2. an off_job seat with no warranty: the link is dead on arrival ==='
BEGIN;
SET LOCAL role authenticated;
SET LOCAL request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-000000000004","role":"authenticated"}';
DO $$
DECLARE v_id uuid; t record; e timestamptz; v_prior uuid; v_st text;
BEGIN
  INSERT INTO project_parties (project_id, party_kind, display_name, phone, phone_e164,
                               stage, on_site_from, on_site_to, off_job_at)
  VALUES ('d0e00000-0000-0000-0000-00000000000a','sub','Off Job Ollie','+16125557702','+16125557702',
          'off_job','2026-02-01','2026-05-31','2026-05-31')
  RETURNING id INTO v_id;
  INSERT INTO field_link_tokens (party_id, project_id, token_hash, expires_at, status)
  VALUES (v_id,'d0e00000-0000-0000-0000-00000000000a', repeat('b',64), now() + interval '45 days','active')
  RETURNING id INTO v_prior;
  SELECT * INTO t FROM public.create_field_link(v_id);
  SELECT expires_at INTO e FROM field_link_tokens WHERE id=t.id;
  SELECT status INTO v_st FROM field_link_tokens WHERE id=v_prior;
  RAISE NOTICE 'minted expiry = %  (dead: %) ; the prior LIVE token (now+45d) is now %', e, (e<=now()), v_st;
  RAISE NOTICE 'reach_state_for = %', public.reach_state_for(NULL,NULL,v_id);
END $$;
ROLLBACK;
