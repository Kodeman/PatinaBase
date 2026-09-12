\pset pager off
BEGIN;
SET LOCAL role authenticated;
SET LOCAL request.jwt.claims TO '{"sub":"a0000000-0000-0000-0000-000000000004","role":"authenticated"}';

\echo '=== MINOR-1: an explicit caller date cannot beat a LIVE window (PR-l) ==='
SELECT pp.display_name, pp.on_site_to, pp.warranty_until,
       (SELECT f.expires_at FROM public.field_link_tokens f
         WHERE f.id = (SELECT id FROM public.create_field_link(pp.id, now() + interval '3 days'))) AS minted_expiry,
       (now() + interval '3 days')::date AS caller_asked
  FROM public.project_parties pp
 WHERE pp.display_name='Erin Sato' AND pp.on_site_to > CURRENT_DATE LIMIT 1;

\echo '=== MINOR-20: an OFF-JOB seat is still minted a fresh 90-day door ==='
UPDATE public.project_parties SET stage='off_job', off_job_at=CURRENT_DATE,
       on_site_to=CURRENT_DATE-40, warranty_until=NULL
 WHERE display_name='Erin Sato' AND project_id='d0e00000-0000-0000-0000-00000000000a';
SELECT pp.display_name, pp.stage, pp.on_site_to,
       (SELECT f.expires_at FROM public.field_link_tokens f
         WHERE f.id = (SELECT id FROM public.create_field_link(pp.id))) AS minted_expiry
  FROM public.project_parties pp
 WHERE pp.display_name='Erin Sato' AND pp.project_id='d0e00000-0000-0000-0000-00000000000a';
ROLLBACK;

\echo '=== MINOR-14: the window end is session-timezone-dependent ==='
BEGIN;
SET LOCAL role authenticated;
SET LOCAL request.jwt.claims TO '{"sub":"a0000000-0000-0000-0000-000000000004","role":"authenticated"}';
SET LOCAL timezone TO 'UTC';
SELECT 'UTC' AS session_tz,
       (SELECT f.expires_at FROM public.field_link_tokens f
         WHERE f.id = (SELECT id FROM public.create_field_link(
            (SELECT id FROM public.project_parties WHERE display_name='Ngozi Eze'
              AND project_id='d0e00000-0000-0000-0000-00000000000a' LIMIT 1)))) AS minted;
ROLLBACK;
BEGIN;
SET LOCAL role authenticated;
SET LOCAL request.jwt.claims TO '{"sub":"a0000000-0000-0000-0000-000000000004","role":"authenticated"}';
SET LOCAL timezone TO 'America/Chicago';
SELECT 'America/Chicago' AS session_tz,
       (SELECT f.expires_at FROM public.field_link_tokens f
         WHERE f.id = (SELECT id FROM public.create_field_link(
            (SELECT id FROM public.project_parties WHERE display_name='Ngozi Eze'
              AND project_id='d0e00000-0000-0000-0000-00000000000a' LIMIT 1)))) AS minted;
ROLLBACK;
