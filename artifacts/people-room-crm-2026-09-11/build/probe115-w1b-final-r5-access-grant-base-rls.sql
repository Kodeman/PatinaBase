\pset pager off
\echo '=== U. RLS posture of every v_access_grants base table read WITHOUT a view predicate ==='
SELECT c.relname, c.relrowsecurity AS rls, c.relforcerowsecurity AS forced,
       (SELECT count(*) FROM pg_policy p WHERE p.polrelid=c.oid) AS policies,
       has_table_privilege('authenticated', c.oid, 'SELECT') AS auth_sel,
       has_table_privilege('anon', c.oid, 'SELECT') AS anon_sel
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND c.relname IN
   ('organization_members','designer_clients','field_link_tokens','document_shares',
    'site_request_access','site_requests','fulfillment_evidence_upload_tokens',
    'project_review_access','trade_rfq_tokens','studio_trade_agreement_tokens',
    'plan_transmittal_tokens','invoice_links')
 ORDER BY c.relname;

\echo '=== U2. policies on the five no-predicate branches ==='
SELECT c.relname, p.polname, p.polcmd,
       array(SELECT r.rolname FROM pg_roles r WHERE r.oid = ANY(p.polroles)) AS roles,
       left(pg_get_expr(p.polqual,p.polrelid), 160) AS using_expr
  FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid
  JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND c.relname IN
  ('organization_members','document_shares','site_request_access',
   'fulfillment_evidence_upload_tokens','project_review_access')
   AND p.polcmd IN ('r','*')
 ORDER BY c.relname, p.polname;
