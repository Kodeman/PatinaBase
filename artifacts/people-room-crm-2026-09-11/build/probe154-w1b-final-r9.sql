\pset pager off
\echo '=== A. v_access_grants: 11 tiers named ==='
SELECT count(DISTINCT t) AS tiers FROM (
  SELECT regexp_matches(pg_get_viewdef('public.v_access_grants'::regclass), '''([a-z_]+)''::text AS tier','g') AS m
) z, unnest(m) t;
SELECT DISTINCT tier FROM public.v_access_grants ORDER BY 1;
\echo '   (as postgres: RLS bypassed, so this lists every tier with data)'

\echo '=== B. people_directory: 17 columns, first 12 unchanged in name+type ==='
SELECT ordinal_position, column_name, data_type FROM information_schema.columns
 WHERE table_name='people_directory' ORDER BY ordinal_position;

\echo '=== C. new/edited functions: definer? volatility? search_path? acl? ==='
SELECT p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' AS fn,
       CASE WHEN p.prosecdef THEN 'DEFINER' ELSE 'invoker' END AS sec,
       p.provolatile AS vol,
       COALESCE(array_to_string(p.proconfig,','),'(none)') AS cfg,
       COALESCE(array_to_string(p.proacl,' '),'(default)') AS acl
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.proname IN (
   'compliance_state','identity_paper_state','identity_consent_status','identity_consent_evidence',
   'identity_phone_numbers','reach_state_for','reach_state_for_identity','identity_seat_count',
   'contact_rule_summary','party_identity_key','party_kind_in_directory','project_tenant_org',
   'project_party_org','project_recorded_studio','project_party_recorded_studio','project_designer',
   'create_field_link','access_grants_trade_rfq','access_grants_trade_agreement_links',
   'access_grants_plan_transmittals','access_grants_invoice_links','assert_compliance_holder',
   'assert_project_party_cards','assert_party_authority_copy_to','assert_site_access_key_holder',
   'is_active_studio_member','is_studio_comember','is_design_studio_comember','is_org_admin_or_owner',
   'studio_contact_org','project_party_designer','channel_consent_status','project_consent_org')
 ORDER BY 1;

\echo '=== D. does any new object WRITE studio_channel_consent? ==='
SELECT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.prosrc ~* '(insert|update|delete)[^;]{0,200}studio_channel_consent'
 ORDER BY 1;

\echo '=== E. cents columns are integer; no money/float ==='
SELECT table_name, column_name, data_type FROM information_schema.columns
 WHERE table_schema='public' AND table_name IN ('project_party_authority','studio_compliance_documents','project_site_access_cards')
 ORDER BY 1, ordinal_position;
