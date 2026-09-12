\pset pager off
\echo '=== tenant-less populations behind 00627 readers ==='
SELECT 'proposals with project_id IS NULL' k, count(*) FROM proposals WHERE project_id IS NULL
UNION ALL SELECT 'trade_rfq_tokens on such proposals', count(*) FROM trade_rfq_tokens t JOIN proposals pr ON pr.id=t.proposal_id WHERE pr.project_id IS NULL
UNION ALL SELECT 'invoices with studio_id IS NULL and project_id IS NULL', count(*) FROM invoices WHERE studio_id IS NULL AND project_id IS NULL
UNION ALL SELECT 'invoice_links on such invoices', count(*) FROM invoice_links il JOIN invoices i ON i.id=il.invoice_id WHERE i.studio_id IS NULL AND i.project_id IS NULL
UNION ALL SELECT 'invoice_links total', count(*) FROM invoice_links
UNION ALL SELECT 'trade_rfq_tokens total', count(*) FROM trade_rfq_tokens
UNION ALL SELECT 'plan_transmittal_tokens total', count(*) FROM plan_transmittal_tokens
UNION ALL SELECT 'studio_trade_agreement_tokens total', count(*) FROM studio_trade_agreement_tokens
UNION ALL SELECT 'fulfillment_evidence_upload_tokens total', count(*) FROM fulfillment_evidence_upload_tokens
UNION ALL SELECT 'project_review_access total', count(*) FROM project_review_access
UNION ALL SELECT 'site_request_access total', count(*) FROM site_request_access
UNION ALL SELECT 'document_shares total', count(*) FROM document_shares
UNION ALL SELECT 'field_link_tokens total', count(*) FROM field_link_tokens;

\echo '=== projects: who records a studio ==='
SELECT p.id, p.name, p.studio_id, pr.email AS designer, p.status::text
  FROM projects p LEFT JOIN profiles pr ON pr.id=p.designer_id ORDER BY p.studio_id NULLS FIRST, p.name;
