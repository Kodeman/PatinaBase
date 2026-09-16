\set ON_ERROR_STOP on
\echo '=== E1: no new object reads a frozen consent column or the seat verdict ==='
SELECT p.proname
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public'
   AND p.proname IN ('compliance_state','identity_consent_status','reach_state_for',
                     'reach_state_for_identity','identity_seat_count','contact_rule_summary',
                     'party_identity_key','party_kind_in_directory','project_party_org',
                     'project_designer','create_field_link',
                     'access_grants_trade_rfq','access_grants_trade_agreement_links',
                     'access_grants_plan_transmittals','access_grants_invoice_links')
   AND p.prosrc ~ 'sms_consent_(status|source|recorded|evidence|disclosure)|sms_consented_at|sms_opt_out_at';
\echo '   (no rows above = no frozen column is read by any new function)'
SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND c.relname IN ('people_directory','people_directory_seats','v_access_grants')
   AND pg_get_viewdef(c.oid) ~ 'pp\.sms_consent|project_parties\.sms_consent|\.sms_consent_status';
\echo '   (no rows above = no view reads the frozen seat verdict)'

BEGIN;
SET LOCAL role authenticated;
SELECT set_config('request.jwt.claims','{"sub":"a0000000-0000-0000-0000-000000000004","role":"authenticated"}', true);

\echo '=== E2: every Directory row with a consent word, vs the record recomputed from scratch ==='
WITH rows AS (
  SELECT pd.person_id, pd.role, pd.display_name, pd.consent_status,
         (pd.meta->>'identity_key')  AS ik,
         (pd.meta->>'entity_kind')   AS entity_kind
  FROM public.people_directory pd
), truth AS (
  SELECT r.*,
    -- recompute worst-first over every number tied to that identity, directly
    -- off studio_channel_consent, with no function in the path
    (SELECT CASE
       WHEN count(*)=0 THEN NULL
       WHEN count(*) FILTER (WHERE w='opted_out')>0 THEN 'opted_out'
       WHEN count(*) FILTER (WHERE w='not_asked')>0 THEN 'not_asked'
       WHEN count(*) FILTER (WHERE w='pending')>0   THEN 'pending'
       ELSE 'granted' END
     FROM (
       SELECT COALESCE((SELECT CASE WHEN scc.status='granted' AND scc.refusal_unanswered THEN 'pending'
                                    ELSE scc.status END
                          FROM public.studio_channel_consent scc
                         WHERE scc.organization_id='b0000000-0000-0000-0000-000000000001'
                           AND scc.channel_kind='sms' AND scc.channel_value=num), 'not_asked') AS w
       FROM (
         SELECT NULLIF(btrim(sc.phone_e164),'') AS num FROM public.studio_contacts sc WHERE sc.id=r.person_id
         UNION
         SELECT NULLIF(btrim(pp.phone_e164),'') FROM public.project_parties pp
          WHERE public.party_identity_key(pp.studio_contact_id,pp.profile_id,pp.phone_e164,pp.email,pp.id)
                = COALESCE(r.ik, r.person_id::text)
       ) n WHERE num IS NOT NULL
     ) v) AS record_word
  FROM rows r
)
SELECT role, display_name, consent_status AS printed, record_word,
       CASE WHEN consent_status IS DISTINCT FROM record_word THEN '<<< DIVERGES' END AS flag
  FROM truth
 WHERE (consent_status IS NOT NULL OR record_word IS NOT NULL)
   AND role IN ('contact','gc','sub','installer','receiver','architect','photographer','stager')
 ORDER BY (consent_status IS DISTINCT FROM record_word) DESC, display_name;
ROLLBACK;
