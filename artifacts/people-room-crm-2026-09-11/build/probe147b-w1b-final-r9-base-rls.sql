\pset pager off
\echo '=== 1. v_access_grants base relations: RLS, policies, and authenticated SELECT ==='
SELECT c.relname, c.relkind, c.relrowsecurity AS rls,
       (SELECT count(*) FROM pg_policies p WHERE p.tablename=c.relname AND p.schemaname='public') AS pols,
       has_table_privilege('authenticated', 'public.'||c.relname, 'SELECT') AS auth_sel,
       has_table_privilege('anon', 'public.'||c.relname, 'SELECT') AS anon_sel
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND c.relname IN (
   'organization_members','designer_clients','field_link_tokens','document_shares',
   'trade_rfq_tokens','studio_trade_agreement_tokens','plan_transmittal_tokens',
   'site_request_access','site_requests','invoice_links','invoices',
   'fulfillment_evidence_upload_tokens','project_review_access','proposals',
   'studio_trade_agreements','projects','project_parties','studio_contact_rules',
   'studio_channel_consent','studio_compliance_documents','project_party_authority',
   'project_site_access_cards')
 ORDER BY c.relname;

\echo '=== 2. policies on the permissive-looking base tables of v_access_grants ==='
SELECT tablename, policyname, cmd, roles::text, coalesce(qual,'(none)') AS qual
  FROM pg_policies
 WHERE schemaname='public'
   AND tablename IN ('organization_members','fulfillment_evidence_upload_tokens',
                     'project_review_access','document_shares','site_request_access')
 ORDER BY tablename, cmd, policyname;

\echo '=== 3. studio_contact_rules: is (subject_type, subject_id) unique? ==='
SELECT i.relname AS index_name, pg_get_indexdef(i.oid) AS def
  FROM pg_class t JOIN pg_index x ON x.indrelid=t.oid JOIN pg_class i ON i.oid=x.indexrelid
 WHERE t.relname='studio_contact_rules'
 ORDER BY 1;
SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
 WHERE conrelid='public.studio_contact_rules'::regclass ORDER BY 1;

\echo '=== 4. the freeze trigger, after 00623-00627 ==='
SELECT t.tgname,
       (SELECT string_agg(a.attname, ' ' ORDER BY a.attname)
          FROM unnest(t.tgattr) col JOIN pg_attribute a
            ON a.attrelid=t.tgrelid AND a.attnum=col) AS frozen_columns
  FROM pg_trigger t
 WHERE t.tgrelid='public.project_parties'::regclass AND NOT t.tgisinternal
 ORDER BY 1;

\echo '=== 5. any new object reading a frozen sms_consent_* column? ==='
SELECT p.proname
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public'
   AND p.proname IN ('compliance_state','identity_paper_state','identity_consent_status',
                     'identity_consent_evidence','identity_phone_numbers','reach_state_for',
                     'reach_state_for_identity','identity_seat_count','contact_rule_summary',
                     'party_identity_key','party_kind_in_directory','project_tenant_org',
                     'project_party_org','project_recorded_studio','project_party_recorded_studio',
                     'project_designer','create_field_link',
                     'access_grants_trade_rfq','access_grants_trade_agreement_links',
                     'access_grants_plan_transmittals','access_grants_invoice_links')
   AND p.prosrc ~ 'sms_consent_';
SELECT 'people_directory' v, (pg_get_viewdef('public.people_directory'::regclass) ~ 'pp\.sms_consent') AS reads_frozen
UNION ALL SELECT 'people_directory_seats', (pg_get_viewdef('public.people_directory_seats'::regclass) ~ 'sms_consent_(status|recorded|source|evidence|disclosure)');

\echo '=== 6. stage backfill result ==='
SELECT pj.status::text AS project_status, pp.stage, count(*)
  FROM project_parties pp JOIN projects pj ON pj.id=pp.project_id
 GROUP BY 1,2 ORDER BY 1,2;
SELECT count(*) AS completed_projects_with_no_completed_at
  FROM projects WHERE status='completed' AND completed_at IS NULL;
