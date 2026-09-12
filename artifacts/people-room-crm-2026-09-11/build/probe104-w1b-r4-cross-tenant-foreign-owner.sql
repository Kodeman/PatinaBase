-- W1b r4 — the new functions walked as a REAL foreign studio's owner.
-- probe103 §E resolved the outsider's uid through RLS and got NULL, which
-- tested the no-uid case instead. This resolves the uid as postgres first,
-- then acts as that user, so the gate is walked by a genuine member of
-- ANOTHER studio. Local only; BEGIN … ROLLBACK.
\set ON_ERROR_STOP on
BEGIN;
\echo '=== who the outsider is (resolved as postgres, before any role switch) ==='
SELECT om.user_id AS outsider, om.organization_id AS their_studio, om.role
  FROM public.organization_members om
  JOIN public.profiles pr ON pr.id = om.user_id
 WHERE pr.email = 'cf-phase1-alice@patina.invalid';

SELECT set_config('probe.outsider',
  (SELECT om.user_id::text FROM public.organization_members om
     JOIN public.profiles pr ON pr.id = om.user_id
    WHERE pr.email = 'cf-phase1-alice@patina.invalid' LIMIT 1), false);

SET LOCAL role authenticated;
SELECT set_config('request.jwt.claims',
  json_build_object('sub', current_setting('probe.outsider'),
                    'role','authenticated')::text, true);

SELECT (select auth.uid()) AS acting_as,
       public.is_active_studio_member('b0000000-0000-0000-0000-000000000001') AS member_of_the_seed_studio;

\echo '=== the seed studio, asked by that outsider ==='
SELECT (SELECT count(*) FROM public.identity_phone_numbers(
          'b0000000-0000-0000-0000-000000000001',
          'd0e10000-0000-0000-0000-000000000011','+16125550101') n(v))  AS numbers_pulled,
       public.identity_consent_status('b0000000-0000-0000-0000-000000000001',
          'd0e10000-0000-0000-0000-000000000011','+16125550101')        AS consent_word,
       public.identity_paper_state('d0e10000-0000-0000-0000-000000000011',
          'd0e20000-0000-0000-0000-000000000002')                       AS paper_word,
       (SELECT count(*) FROM public.identity_consent_evidence(
          'b0000000-0000-0000-0000-000000000001',
          'd0e10000-0000-0000-0000-000000000011','+16125550101'))       AS evidence_rows,
       (SELECT count(*) FROM public.people_directory)                   AS directory_rows_visible,
       (SELECT count(*) FROM public.people_directory_seats)             AS seat_rows_visible;

\echo '=== and their OWN studio still answers, so the gate is a gate and not a wall ==='
SELECT (SELECT count(*) FROM public.identity_phone_numbers(
          om.organization_id, 'no-such-identity', '+15550001111') n(v)) AS own_studio_card_number_echoed
  FROM public.organization_members om
 WHERE om.user_id = current_setting('probe.outsider')::uuid
 LIMIT 1;
ROLLBACK;
