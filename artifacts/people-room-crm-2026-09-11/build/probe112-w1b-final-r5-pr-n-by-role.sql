\pset pager off
BEGIN;
INSERT INTO auth.users (id, email, aud, role, instance_id)
VALUES ('cc000000-0000-4000-8000-0000000000m1','plainmember@patina.invalid','authenticated','authenticated','00000000-0000-0000-0000-000000000000')
ON CONFLICT (id) DO NOTHING;
ROLLBACK;
BEGIN;
INSERT INTO auth.users (id, email, aud, role, instance_id)
VALUES ('cc000000-0000-4000-8000-00000000ee01','plainmember@patina.invalid','authenticated','authenticated','00000000-0000-0000-0000-000000000000')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.profiles (id, email, role) VALUES ('cc000000-0000-4000-8000-00000000ee01','plainmember@patina.invalid','designer') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.organization_members (user_id, organization_id, role, status, joined_at)
VALUES ('cc000000-0000-4000-8000-00000000ee01','b0000000-0000-0000-0000-000000000001','member','active',now())
ON CONFLICT (user_id, organization_id) DO UPDATE SET role='member', status='active';

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"cc000000-0000-4000-8000-00000000ee01","role":"authenticated"}';
SELECT public.is_active_studio_member('b0000000-0000-0000-0000-000000000001') AS member,
       public.is_org_admin_or_owner('b0000000-0000-0000-0000-000000000001') AS admin,
       public.is_studio_comember('a0000000-0000-0000-0000-000000000004') AS comember;

\echo '=== Y. PR-n as a PLAIN MEMBER ==='
DO $$
DECLARE seat uuid;
BEGIN
  SELECT id INTO seat FROM public.project_parties WHERE project_id='d0e00000-0000-0000-0000-00000000000a' LIMIT 1;
  BEGIN
    INSERT INTO public.project_party_authority (engagement_id, scope) VALUES (seat,'selections');
    RAISE NOTICE 'Y1 selections: LANDED (correct)';
  EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'Y1 selections REFUSED: %', SQLERRM; END;
  BEGIN
    INSERT INTO public.project_party_authority (engagement_id, scope, threshold_cents) VALUES (seat,'money',250000);
    RAISE NOTICE 'Y2 money: LANDED — PR-n GATE LOST';
  EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'Y2 money REFUSED: % (%)', SQLERRM, SQLSTATE; END;
  BEGIN
    INSERT INTO public.project_party_authority (engagement_id, scope) VALUES (seat,'draw_certify');
    RAISE NOTICE 'Y3 draw_certify: LANDED — PR-n GATE LOST';
  EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'Y3 draw_certify REFUSED: % (%)', SQLERRM, SQLSTATE; END;
  -- escalation: land a non-money grant then UPDATE its scope to money
  BEGIN
    UPDATE public.project_party_authority SET scope='money' WHERE engagement_id=seat AND scope='selections';
    RAISE NOTICE 'Y4 scope escalation selections->money: %s rows — PR-n GATE LOST if >0', (SELECT count(*) FROM public.project_party_authority WHERE engagement_id=seat AND scope='money');
  EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'Y4 escalation REFUSED: % (%)', SQLERRM, SQLSTATE; END;
END $$;

\echo '=== Y5. as the OWNER, money lands ==='
SET LOCAL "request.jwt.claims" = '{"sub":"a0000000-0000-0000-0000-000000000004","role":"authenticated"}';
DO $$
DECLARE seat uuid;
BEGIN
  SELECT id INTO seat FROM public.project_parties WHERE project_id='d0e00000-0000-0000-0000-00000000000a' LIMIT 1;
  BEGIN
    INSERT INTO public.project_party_authority (engagement_id, scope, threshold_cents) VALUES (seat,'money',250000);
    RAISE NOTICE 'Y5 money as owner: LANDED (correct)';
  EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'Y5 money as owner REFUSED: %', SQLERRM; END;
END $$;
ROLLBACK;
