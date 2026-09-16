-- probe127 — r6: create_field_link's caller-date branch (MINOR-1), an off_job
-- mint (MINOR-20), the Rivera duplicate (MINOR-37) and the two ungated definer
-- uuid oracles (MINOR-12).
\set ON_ERROR_STOP on
\set OWNER '''a0000000-0000-0000-0000-000000000004'''
BEGIN;
\echo '=== MINOR-37: one firm, two Directory rows ==='
SELECT set_config('request.jwt.claims', json_build_object('sub', :OWNER, 'role','authenticated')::text, true);
SET LOCAL ROLE authenticated;
SELECT person_id, role, display_name, seat_count, consent_status, paper_state, meta->>'entity_kind' AS kind
  FROM public.people_directory WHERE display_name ILIKE 'Rivera%' ORDER BY role;
\echo '-- and the card that shares its number'
SELECT id, company_name, phone_e164 FROM public.studio_contacts WHERE phone_e164='+16125550219';
SELECT id, display_name, phone_e164, studio_contact_id FROM public.project_parties WHERE phone_e164='+16125550219';

\echo ''
\echo '=== MINOR-1: a caller date cannot beat a LIVE window ==='
SELECT pp.id, pp.display_name, pp.on_site_to, pp.warranty_until, pp.stage
  FROM public.project_parties pp
 WHERE pp.on_site_to > CURRENT_DATE ORDER BY pp.on_site_to LIMIT 3;
DO $$
DECLARE v_seat uuid; v_id uuid; v_tok text; v_exp timestamptz;
BEGIN
  SELECT id INTO v_seat FROM public.project_parties
   WHERE on_site_to > CURRENT_DATE ORDER BY on_site_to LIMIT 1;
  SELECT id INTO v_id FROM public.create_field_link(v_seat, now() + interval '5 days');
  SELECT expires_at INTO v_exp FROM public.field_link_tokens WHERE id = v_id;
  RAISE NOTICE 'asked for 5 days; got %  (days = %)', v_exp::date, round(extract(epoch from (v_exp - now()))/86400);
END $$;

\echo ''
\echo '=== MINOR-20: a mint on an OFF_JOB seat ==='
DO $$
DECLARE v_seat uuid; v_id uuid; v_exp timestamptz; v_stage text;
BEGIN
  SELECT id, stage INTO v_seat, v_stage FROM public.project_parties
   WHERE stage = 'off_job' LIMIT 1;
  IF v_seat IS NULL THEN RAISE NOTICE 'no off_job seat in the fixture'; RETURN; END IF;
  SELECT id INTO v_id FROM public.create_field_link(v_seat);
  SELECT expires_at INTO v_exp FROM public.field_link_tokens WHERE id = v_id;
  RAISE NOTICE 'off_job seat (%): minted, expires % (days = %)', v_stage, v_exp::date,
        round(extract(epoch from (v_exp - now()))/86400);
END $$;
RESET ROLE;

\echo ''
\echo '=== MINOR-12: the two ungated definer uuid oracles, called by a FOREIGN studio owner ==='
SELECT set_config('request.jwt.claims','{"sub":"cf100000-0000-4000-8000-000000000001","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
SELECT public.project_designer('d0e00000-0000-0000-0000-00000000000a') AS designer_of_a_foreign_project,
       public.project_party_org((SELECT id FROM public.project_parties LIMIT 1)) AS org_of_a_foreign_seat,
       public.is_active_studio_member('b0000000-0000-0000-0000-000000000001') AS am_i_a_member;
RESET ROLE;
ROLLBACK;
