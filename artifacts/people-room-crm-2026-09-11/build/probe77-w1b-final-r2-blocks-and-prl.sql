BEGIN;
CREATE OR REPLACE FUNCTION pg_temp.assume_user(p_user_id UUID) RETURNS VOID AS $$
BEGIN
  PERFORM set_config('role','authenticated',true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub',p_user_id::text,'role','authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
END; $$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION pg_temp.assume_user(UUID) TO PUBLIC;
CREATE OR REPLACE FUNCTION pg_temp.reset_role() RETURNS VOID AS $$
BEGIN EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims',NULL,true); END; $$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION pg_temp.reset_role() TO PUBLIC;

\echo '=== A. the party branch date join, on an UNCARDED seat that has a record ==='
INSERT INTO public.project_parties (id, project_id, party_kind, display_name, phone, phone_e164, stage)
VALUES ('dddd4444-0000-4000-8000-0000000000a1',
        (SELECT id FROM public.projects WHERE name='Okonkwo residence'),
        'sub','Uncarded Painter','+16125558877','+16125558877','active');
INSERT INTO public.studio_channel_consent
  (organization_id, channel_kind, channel_value, status, source, evidence,
   disclosure_version, recorded_by, recorded_at, consented_at)
VALUES ('b0000000-0000-0000-0000-000000000001','sms','+16125558877','granted','written',
        'kickoff form','v1','a0000000-0000-0000-0000-000000000004', now(), now() - interval '3 days')
ON CONFLICT (organization_id, channel_kind, channel_value) DO UPDATE SET status='granted';
SELECT pg_temp.assume_user('a0000000-0000-0000-0000-000000000004');
SELECT display_name, consent_status, meta->>'sms_consented_at' AS meta_consented_at, meta->>'sms_opt_out_at' AS meta_opt_out
  FROM public.people_directory WHERE display_name='Uncarded Painter';
SELECT pg_temp.reset_role();

\echo ''
\echo '=== B. PR-l: can the studio choose a date when the seat carries a window? ==='
DO $$
DECLARE v_seat uuid; v_id uuid; v_tok text; v_exp timestamptz; v_asked timestamptz;
BEGIN
  SELECT pp.id INTO v_seat FROM public.project_parties pp
   WHERE pp.display_name='Erin Sato' AND pp.on_site_to = DATE '2027-08-13';
  v_asked := now() + interval '14 days';
  PERFORM set_config('request.jwt.claims', json_build_object('sub','a0000000-0000-0000-0000-000000000004','role','authenticated')::text, true);
  SELECT id, token INTO v_id, v_tok FROM public.create_field_link(v_seat, v_asked);
  SELECT expires_at INTO v_exp FROM public.field_link_tokens WHERE id=v_id;
  RAISE NOTICE 'caller asked %, seat window ends 2027-08-13, token expires % -> caller date honoured: %',
    v_asked::date, v_exp::date, (v_exp = v_asked);
END $$;

\echo ''
\echo '=== C. one UPDATE of blocks[] flips a lapse to current, with no guard and no audit ==='
SELECT pg_temp.assume_user('a0000000-0000-0000-0000-000000000004');
SELECT public.compliance_state('d0e20000-0000-0000-0000-000000000003') AS before_blocks_edit;
UPDATE public.studio_compliance_documents SET blocks = '{}'::text[]
 WHERE id='d0e50000-0000-0000-0000-000000000006';
SELECT public.compliance_state('d0e20000-0000-0000-0000-000000000003') AS after_blocks_edit;
\echo '    and a plain DELETE of the lapsed COI:'
DELETE FROM public.studio_compliance_documents WHERE id='d0e50000-0000-0000-0000-000000000006';
SELECT public.compliance_state('d0e20000-0000-0000-0000-000000000003') AS after_delete;
SELECT pg_temp.reset_role();

\echo ''
\echo '=== D. did the seed write any FROZEN consent column on a seat? ==='
SELECT count(*) AS seats_with_a_nondefault_consent_column
  FROM public.project_parties
 WHERE sms_consent_status <> 'not_asked' OR sms_consented_at IS NOT NULL OR sms_opt_out_at IS NOT NULL
    OR sms_consent_source IS NOT NULL OR sms_consent_evidence IS NOT NULL
    OR sms_consent_recorded_at IS NOT NULL OR sms_consent_recorded_by IS NOT NULL
    OR sms_consent_disclosure_version IS NOT NULL;
ROLLBACK;
