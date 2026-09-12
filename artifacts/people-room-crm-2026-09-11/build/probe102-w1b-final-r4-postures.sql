\set ON_ERROR_STOP on
\echo '=== J1: the freeze trigger still names exactly the eight consent columns plus phone/phone_e164 ==='
SELECT string_agg(a.attname, ' · ' ORDER BY a.attname)
  FROM pg_trigger t JOIN unnest(t.tgattr) att(n) ON true
  JOIN pg_attribute a ON a.attrelid=t.tgrelid AND a.attnum=att.n
 WHERE t.tgname='refuse_legacy_consent_write_trg';

\echo '=== J2: the new functions — definer? volatility? search_path? acl? ==='
SELECT p.proname,
       CASE WHEN p.prosecdef THEN 'definer' ELSE 'INVOKER' END AS sec,
       p.provolatile AS vol,
       COALESCE(array_to_string(p.proconfig,','),'(none)') AS cfg,
       COALESCE(array_to_string(ARRAY(SELECT DISTINCT (aclexplode(p.proacl)).grantee::regrole::text ORDER BY 1),','),'(default)') AS acl
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.proname IN
  ('compliance_state','assert_compliance_holder','project_party_org','assert_project_party_cards',
   'assert_party_authority_copy_to','project_designer','assert_site_access_key_holder',
   'party_identity_key','party_kind_in_directory','reach_state_for','reach_state_for_identity',
   'identity_seat_count','contact_rule_summary','identity_consent_status','create_field_link',
   'access_grants_trade_rfq','access_grants_trade_agreement_links',
   'access_grants_plan_transmittals','access_grants_invoice_links')
 ORDER BY 1, p.oid;

BEGIN;
SET LOCAL role authenticated;
SELECT set_config('request.jwt.claims','{"sub":"a0000000-0000-0000-0000-000000000004","role":"authenticated"}', true);
\echo '=== J3: the party branch — does the WORD and the two DATES belong to the same number? ==='
SELECT display_name, consent_status,
       meta->>'phone_e164'       AS winning_seat_number,
       meta->>'sms_consented_at' AS consented_at,
       meta->>'sms_opt_out_at'   AS opt_out_at
  FROM public.people_directory
 WHERE role IN ('gc','sub','installer','receiver','architect','photographer','stager');
\echo '=== J4: and on the contacts branch, where every carded human now lives ==='
SELECT count(*) AS carded_rows_with_a_consent_word,
       count(*) FILTER (WHERE meta ? 'sms_consented_at') AS rows_carrying_a_consent_date
  FROM public.people_directory WHERE role='contact' AND consent_status IS NOT NULL;
\echo '=== J5: v_access_grants tiers, as the studio owner ==='
SELECT tier, count(*) FROM public.v_access_grants GROUP BY 1 ORDER BY 1;
SELECT count(*) AS grant_ids_that_look_like_a_64hex_token
  FROM public.v_access_grants WHERE grant_id ~ '[0-9a-f]{64}';
ROLLBACK;
