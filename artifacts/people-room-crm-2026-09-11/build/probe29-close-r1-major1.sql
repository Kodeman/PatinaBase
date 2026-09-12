-- probe29 — close-review r1 MAJOR-1, before/after on one fixture.
-- Objects and behaviour only. One transaction, ROLLBACKed.
BEGIN;

INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
VALUES
  ('a1000000-0000-4000-8000-000000000001', 'p29-alice@test.invalid', '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('a1000000-0000-4000-8000-000000000003', 'p29-carol@test.invalid', '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
INSERT INTO profiles (id, email, full_name, created_at, updated_at)
VALUES
  ('a1000000-0000-4000-8000-000000000001', 'p29-alice@test.invalid', 'Alice', NOW(), NOW()),
  ('a1000000-0000-4000-8000-000000000003', 'p29-carol@test.invalid', 'Carol', NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

INSERT INTO organizations (id, type, name, slug, status, created_at, updated_at)
VALUES
  ('b1000000-0000-4000-8000-00000000000a', 'design_studio', 'P29 Alpha', 'p29-alpha', 'active', NOW(), NOW()),
  ('b1000000-0000-4000-8000-00000000000b', 'design_studio', 'P29 Beta',  'p29-beta',  'active', NOW(), NOW());
INSERT INTO organization_members (user_id, organization_id, role, status, joined_at, created_at, updated_at)
VALUES
  ('a1000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-00000000000a', 'owner',  'active', NOW(), NOW(), NOW()),
  ('a1000000-0000-4000-8000-000000000003', 'b1000000-0000-4000-8000-00000000000a', 'member', 'active', '2026-01-01T00:00:00Z', NOW(), NOW()),
  ('a1000000-0000-4000-8000-000000000003', 'b1000000-0000-4000-8000-00000000000b', 'admin',  'active', '2025-01-01T00:00:00Z', NOW(), NOW());

INSERT INTO projects (id, name, designer_id, studio_id, created_by, status, created_at, updated_at)
VALUES ('d1000000-0000-4000-8000-00000000000c', 'P29 Carol job',
        'a1000000-0000-4000-8000-000000000003', NULL,
        'a1000000-0000-4000-8000-000000000003', 'active', NOW(), NOW());
INSERT INTO project_parties (id, project_id, party_kind, display_name, phone, sms_consent_status)
VALUES ('e1000000-0000-4000-8000-00000000000c', 'd1000000-0000-4000-8000-00000000000c',
        'sub', 'Ray Thao', '(612) 555-9001', 'not_asked');
INSERT INTO studio_channel_consent (organization_id, channel_kind, channel_value, status, refusal_unanswered)
VALUES ('b1000000-0000-4000-8000-00000000000b', 'sms', '+16125559001', 'opted_out', true),
       ('b1000000-0000-4000-8000-00000000000a', 'sms', '+16125559001', 'granted',   false);

\echo '=== the project carries no studio_id ==='
SELECT studio_id FROM projects WHERE id = 'd1000000-0000-4000-8000-00000000000c';

\echo '=== the DEFINER answer (every writer: fold, RPC seat gate, send rail) ==='
SELECT public._primary_studio_for('a1000000-0000-4000-8000-000000000003') AS definer_org,
       public.project_consent_org('d1000000-0000-4000-8000-00000000000c') AS resolver_org;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  json_build_object('sub','a1000000-0000-4000-8000-000000000001','role','authenticated')::text, true);

\echo '=== BEFORE: the expression the views used to inline, as Alpha''s owner ==='
SELECT (SELECT om2.organization_id
          FROM public.organization_members om2
          JOIN public.organizations o2 ON o2.id = om2.organization_id
         WHERE om2.user_id = 'a1000000-0000-4000-8000-000000000003'
           AND om2.status  = 'active'
           AND o2.type     = 'design_studio'
         ORDER BY (om2.role = 'owner') DESC, om2.joined_at NULLS LAST, om2.created_at
         LIMIT 1) AS inlined_org;

\echo '=== BEFORE: the consent word that expression produced ==='
SELECT COALESCE(public.channel_consent_status(
  (SELECT om2.organization_id
     FROM public.organization_members om2
     JOIN public.organizations o2 ON o2.id = om2.organization_id
    WHERE om2.user_id = 'a1000000-0000-4000-8000-000000000003'
      AND om2.status  = 'active'
      AND o2.type     = 'design_studio'
    ORDER BY (om2.role = 'owner') DESC, om2.joined_at NULLS LAST, om2.created_at
    LIMIT 1),
  'sms', '+16125559001'), 'not_asked') AS word_before;

\echo '=== AFTER: the resolver, and the word the shipped view now prints ==='
SELECT public.project_consent_org('d1000000-0000-4000-8000-00000000000c') AS resolver_org_as_alice;
SELECT sms_consent_status AS word_after FROM v_project_roster
 WHERE roster_id = 'e1000000-0000-4000-8000-00000000000c';

RESET ROLE;
ROLLBACK;
