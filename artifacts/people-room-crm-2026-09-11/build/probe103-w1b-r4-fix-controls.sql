-- ═══════════════════════════════════════════════════════════════════════════
-- W1b r4 fix controls — the four MAJORs, after the fix
--
-- Local Postgres only (postgresql://postgres:postgres@127.0.0.1:54322/postgres).
-- Every act inside BEGIN … ROLLBACK; probe objects only, never the ledger.
--
--   A  the new functions' posture and grants
--   B  R-AW/R-AY: no frozen consent column read anywhere in the wave
--   C  whole-fixture consent sweep: every printed word vs the record,
--      recomputed with NO Patina function in the path
--   D  whole-fixture paper sweep: the new formula vs the old COALESCE one,
--      and vs a hand-written worst-first over both holders
--   E  cross-tenant: the definer number set and both new words, as a
--      genuinely foreign studio's owner, and as anon
--   F  the shape of the room is unchanged (row counts, twelve+five columns)
-- ═══════════════════════════════════════════════════════════════════════════
\set ON_ERROR_STOP on
BEGIN;

\echo '=== A: posture of the four functions the fix adds or changes ==='
SELECT p.proname,
       p.prosecdef                                   AS security_definer,
       p.provolatile                                 AS volatility,
       array_to_string(p.proconfig, ',')             AS proconfig,
       pg_get_function_result(p.oid)                 AS returns
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public'
   AND p.proname IN ('identity_paper_state','identity_phone_numbers',
                     'identity_consent_status','identity_consent_evidence')
 ORDER BY 1;

\echo '=== A2: grants both directions on those four ==='
SELECT p.proname,
       has_function_privilege('anon',          p.oid, 'EXECUTE') AS anon,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated,
       has_function_privilege('service_role',  p.oid, 'EXECUTE') AS service_role
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public'
   AND p.proname IN ('identity_paper_state','identity_phone_numbers',
                     'identity_consent_status','identity_consent_evidence')
 ORDER BY 1;

\echo '=== B: R-AW/R-AY — no function of this wave reads a frozen seat column ==='
SELECT count(*) AS functions_reading_a_frozen_consent_column
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public'
   AND p.proname IN ('identity_paper_state','identity_phone_numbers',
                     'identity_consent_status','identity_consent_evidence',
                     'party_identity_key','party_kind_in_directory',
                     'reach_state_for','reach_state_for_identity',
                     'identity_seat_count','contact_rule_summary',
                     'compliance_state','assert_compliance_holder')
   AND p.prosrc ~ 'sms_consent_(status|source|recorded|evidence|disclosure)|sms_consented_at|sms_opt_out_at';

SELECT count(*) AS views_reading_the_frozen_seat_verdict
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'public'
   AND c.relname IN ('people_directory','people_directory_seats','v_access_grants')
   AND pg_get_viewdef(c.oid) ~ 'pp\.sms_consent|project_parties\.sms_consent|\.sms_consent_status';

\echo '=== B2: identity_consent_status still resolves every number through the record ==='
SELECT (prosrc ILIKE '%channel_consent_status%')  AS reaches_the_record,
       (prosrc ILIKE '%identity_phone_numbers%')  AS uses_the_gated_number_set
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname='public' AND p.proname='identity_consent_status';

-- ── the studio's owner, through ordinary RLS ───────────────────────────────
SET LOCAL role authenticated;
SELECT set_config('request.jwt.claims',
  '{"sub":"a0000000-0000-0000-0000-000000000004","role":"authenticated"}', true);

\echo '=== C: every printed consent word vs the record, no Patina function in the path ==='
WITH printed AS (
  SELECT pd.person_id, pd.display_name, pd.consent_status,
         COALESCE(pd.meta->>'organization_id',
                  'b0000000-0000-0000-0000-000000000001') AS org,
         sc.phone_e164                                     AS card_number
    FROM public.people_directory pd
    LEFT JOIN public.studio_contacts sc ON sc.id = pd.person_id
   WHERE pd.consent_status IS NOT NULL
),
numbers AS (
  SELECT p.person_id, p.card_number AS v FROM printed p WHERE p.card_number IS NOT NULL
  UNION
  SELECT p.person_id, pp.phone_e164
    FROM printed p
    JOIN public.project_parties pp
      ON pp.studio_contact_id = p.person_id
   WHERE pp.phone_e164 IS NOT NULL
),
hand AS (
  SELECT n.person_id,
         CASE
           WHEN bool_or(COALESCE(scc.refusal_unanswered, false)
                        OR scc.status = 'opted_out'
                        OR scc.status IS NULL AND false)             THEN 'opted_out'
           WHEN bool_or(scc.status IS NULL)                          THEN 'not_asked'
           WHEN bool_or(scc.status = 'not_asked')                    THEN 'not_asked'
           WHEN bool_or(scc.status = 'pending')                      THEN 'pending'
           ELSE 'granted'
         END AS word
    FROM numbers n
    LEFT JOIN public.studio_channel_consent scc
      ON scc.organization_id = 'b0000000-0000-0000-0000-000000000001'
     AND scc.channel_kind = 'sms' AND scc.channel_value = n.v
   GROUP BY n.person_id
)
SELECT count(*) AS carded_rows_compared,
       count(*) FILTER (WHERE p.consent_status <> h.word) AS rows_where_the_word_diverges
  FROM printed p JOIN hand h ON h.person_id = p.person_id;

\echo '=== D: the paper word — new formula vs the old COALESCE, and vs hand ==='
SELECT count(*)                                                        AS contact_rows,
       count(*) FILTER (WHERE pd.paper_state <> public.compliance_state(
                          COALESCE((pd.meta->>'company_id')::uuid, pd.person_id)))
                                                                       AS rows_the_old_formula_would_differ_on,
       count(*) FILTER (WHERE pd.paper_state <> CASE
           WHEN 'lapsed' IN (public.compliance_state(pd.person_id),
                             public.compliance_state((pd.meta->>'company_id')::uuid))
                THEN 'lapsed'
           WHEN 'lapses_soon' IN (public.compliance_state(pd.person_id),
                                  public.compliance_state((pd.meta->>'company_id')::uuid))
                THEN 'lapses_soon'
           WHEN 'current' IN (public.compliance_state(pd.person_id),
                              public.compliance_state((pd.meta->>'company_id')::uuid))
                THEN 'current'
           ELSE 'not_on_file' END)                                     AS rows_disagreeing_with_hand_worst_first
  FROM public.people_directory pd
 WHERE pd.role = 'contact';

\echo '=== D2: F-09 Luis Ochoa, the fixture row holder_type=person exists for ==='
SELECT pd.display_name, pd.paper_state,
       public.compliance_state(pd.person_id)                      AS his_own_card,
       public.compliance_state((pd.meta->>'company_id')::uuid)    AS his_firm
  FROM public.people_directory pd
 WHERE pd.person_id = 'd0e10000-0000-0000-0000-000000000009';

\echo '=== E: cross-tenant, as the owner of a genuinely foreign studio ==='
SELECT set_config('request.jwt.claims',
  (SELECT json_build_object('sub', om.user_id::text, 'role','authenticated')::text
     FROM public.organization_members om
     JOIN public.profiles pr ON pr.id = om.user_id
    WHERE pr.email = 'cf-phase1-alice@patina.invalid' LIMIT 1), true);
SELECT (select auth.uid()) AS acting_as,
       public.is_active_studio_member('b0000000-0000-0000-0000-000000000001') AS member_of_the_seed_studio;
SELECT count(*) AS numbers_the_outsider_can_pull
  FROM public.identity_phone_numbers(
         'b0000000-0000-0000-0000-000000000001',
         'd0e10000-0000-0000-0000-000000000011', '+16125550101') n(v);
SELECT public.identity_consent_status('b0000000-0000-0000-0000-000000000001',
         'd0e10000-0000-0000-0000-000000000011', '+16125550101') AS outsider_consent_word,
       public.identity_paper_state('d0e10000-0000-0000-0000-000000000011',
         'd0e20000-0000-0000-0000-000000000002')                 AS outsider_paper_word,
       (SELECT count(*) FROM public.identity_consent_evidence(
         'b0000000-0000-0000-0000-000000000001',
         'd0e10000-0000-0000-0000-000000000011', '+16125550101')) AS outsider_evidence_rows;

RESET role;
SET LOCAL role anon;
\echo '=== E2: anon ==='
DO $$
BEGIN
  PERFORM public.identity_phone_numbers('b0000000-0000-0000-0000-000000000001','x','+1');
  RAISE NOTICE 'anon identity_phone_numbers LANDED (unexpected)';
EXCEPTION WHEN others THEN RAISE NOTICE 'anon identity_phone_numbers -> %', SQLERRM;
END $$;
DO $$
BEGIN
  PERFORM public.identity_consent_evidence('b0000000-0000-0000-0000-000000000001','x','+1');
  RAISE NOTICE 'anon identity_consent_evidence LANDED (unexpected)';
EXCEPTION WHEN others THEN RAISE NOTICE 'anon identity_consent_evidence -> %', SQLERRM;
END $$;
DO $$
BEGIN
  PERFORM public.identity_paper_state('d0e10000-0000-0000-0000-000000000011', NULL);
  RAISE NOTICE 'anon identity_paper_state LANDED (unexpected)';
EXCEPTION WHEN others THEN RAISE NOTICE 'anon identity_paper_state -> %', SQLERRM;
END $$;

RESET role;
SET LOCAL role authenticated;
SELECT set_config('request.jwt.claims',
  '{"sub":"a0000000-0000-0000-0000-000000000004","role":"authenticated"}', true);
\echo '=== F: the shape of the room is unchanged ==='
SELECT (SELECT count(*) FROM public.people_directory)            AS directory_rows,
       (SELECT count(*) FROM public.people_directory_seats)      AS seat_rows,
       (SELECT count(*) FROM information_schema.columns
         WHERE table_schema='public' AND table_name='people_directory') AS directory_columns,
       (SELECT count(*) FROM public.people_directory pd
         WHERE pd.seat_count > 0
           AND pd.seat_count <> (SELECT count(*) FROM public.people_directory_seats s
                                  WHERE s.person_id = pd.person_id))    AS rows_claiming_a_count_they_cannot_nest;

SELECT display_name, reach_state, consent_status, paper_state, seat_count
  FROM public.people_directory
 WHERE display_name IN ('Dana Kowalski','Pete Rusk','Amara Osei','Ray Thao')
 ORDER BY 1;

ROLLBACK;
