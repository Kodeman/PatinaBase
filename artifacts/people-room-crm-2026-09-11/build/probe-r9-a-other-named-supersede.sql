-- W4 r9 MAJOR-1 — the predicate that picked the wrong paper, side by side with
-- the fixed one, on the same rows. Run:
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
--        -v ON_ERROR_STOP=1 -f <this file>
-- One transaction, ROLLBACKed.
BEGIN;

INSERT INTO public.organizations (id, type, name, slug, status) VALUES
  ('fd000000-0000-4000-8000-000000000001','design_studio','r9 probe studio','r9-probe-studio','active');
INSERT INTO public.organization_members (user_id, organization_id, role, status, joined_at) VALUES
  ('a0000000-0000-0000-0000-000000000004','fd000000-0000-4000-8000-000000000001','owner','active', now());
INSERT INTO public.studio_contacts
  (id, organization_id, entity_kind, contact_kind, company_name, company_kind) VALUES
  ('fd200000-0000-4000-8000-000000000001','fd000000-0000-4000-8000-000000000001','company','sub','Probe Firm','sub');

-- what the studio holds: ONE named paper, gated (the review's own shape —
-- firm d0e2…0011 held a verified 'Resale certificate' and nothing else)
INSERT INTO public.studio_compliance_documents
  (id, organization_id, holder_type, holder_id, doc_type, doc_label, blocks,
   issued_on, expires_on, verified_at)
VALUES
  ('fd700000-0000-4000-8000-000000000001','fd000000-0000-4000-8000-000000000001','company',
   'fd200000-0000-4000-8000-000000000001','other_named','Resale certificate',
   ARRAY['payment']::text[], CURRENT_DATE - 100, CURRENT_DATE + 200, now() - interval '20 days');

-- what the firm just sent through the door: a Safety plan, unchecked
INSERT INTO public.studio_compliance_documents
  (id, organization_id, holder_type, holder_id, doc_type, doc_label, blocks,
   issued_on, expires_on, source, inbound)
VALUES
  ('fd700000-0000-4000-8000-000000000003','fd000000-0000-4000-8000-000000000001','company',
   'fd200000-0000-4000-8000-000000000001','other_named','Safety plan',
   '{}'::text[], CURRENT_DATE, CURRENT_DATE + 400, 'field_link', true);

-- THE OLD PREDICATE (doc_type only) — what confirm_inbound_document used to pick
SELECT 'old predicate picks' AS which, d.doc_label, d.blocks
  FROM public.studio_compliance_documents d,
       public.studio_compliance_documents v
 WHERE v.id = 'fd700000-0000-4000-8000-000000000003'
   AND d.holder_id = v.holder_id
   AND d.organization_id = v.organization_id
   AND d.doc_type = v.doc_type
   AND d.id <> v.id
   AND d.verified_at IS NOT NULL
   AND d.superseded_by IS NULL
 ORDER BY d.verified_at DESC
 LIMIT 1;

-- THE FIXED PREDICATE (doc_type + case-folded doc_label for other_named)
SELECT 'fixed predicate picks' AS which, d.doc_label, d.blocks
  FROM public.studio_compliance_documents d,
       public.studio_compliance_documents v
 WHERE v.id = 'fd700000-0000-4000-8000-000000000003'
   AND d.holder_id = v.holder_id
   AND d.organization_id = v.organization_id
   AND d.doc_type = v.doc_type
   AND (v.doc_type <> 'other_named'
        OR lower(btrim(COALESCE(d.doc_label,''))) = lower(btrim(COALESCE(v.doc_label,''))))
   AND d.id <> v.id
   AND d.verified_at IS NOT NULL
   AND d.superseded_by IS NULL
 ORDER BY d.verified_at DESC
 LIMIT 1;

-- and the live function, end to end: the Resale certificate is NOT retired,
-- and the confirm is not refused for failing to carry a gate that was never
-- this paper's to carry
SELECT set_config('request.jwt.claims',
  json_build_object('sub','a0000000-0000-0000-0000-000000000004','role','authenticated')::text, true);
SET LOCAL ROLE authenticated;
SELECT public.confirm_inbound_document('fd700000-0000-4000-8000-000000000003') IS NOT NULL
       AS confirm_landed;

RESET ROLE;

SELECT d.doc_label, d.verified_at IS NOT NULL AS verified,
       d.superseded_by IS NOT NULL AS retired
  FROM public.studio_compliance_documents d
 WHERE d.holder_id = 'fd200000-0000-4000-8000-000000000001'
 ORDER BY d.doc_label, d.created_at;

ROLLBACK;
