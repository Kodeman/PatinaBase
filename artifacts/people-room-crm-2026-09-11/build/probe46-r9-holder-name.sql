\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE
  v_org uuid;
  v_creator uuid;
  v_person uuid;
  v_doc uuid;
BEGIN
  SELECT organization_id, created_by INTO v_org, v_creator
    FROM public.studio_contacts WHERE entity_kind='person' LIMIT 1;

  -- A person card promoted from a seat: usePromoteToStudioContact() copies the
  -- seat's free-text firm into studio_contacts.company_name on a PERSON row.
  INSERT INTO public.studio_contacts
    (organization_id, entity_kind, contact_kind, full_name, company_name, created_by)
  VALUES (v_org, 'person', 'sub', 'Marco Feliz', 'Northgate Electric', v_creator)
  RETURNING id INTO v_person;

  -- His OWN master licence, the reason holder_type='person' exists. Lapsed.
  INSERT INTO public.studio_compliance_documents
    (organization_id, holder_id, holder_type, doc_type, expires_on, blocks)
  VALUES (v_org, v_person, 'person', 'license', CURRENT_DATE - 3,
          ARRAY['site_access']::text[])
  RETURNING id INTO v_doc;

  RAISE NOTICE 'person=% doc=% state=%', v_person, v_doc,
    public.compliance_document_state(v_doc);
END $$;

SELECT public.sweep_compliance_expiries();

SELECT n.metadata->>'holder_type'  AS holder_type,
       n.metadata->>'holder_name'  AS holder_name,
       n.metadata->>'subject'      AS subject,
       n.metadata->>'message'      AS message,
       n.metadata->>'deep_link'    AS deep_link
  FROM public.notification_log n
 WHERE n.type='compliance_document_expiry'
   AND n.metadata->>'doc_type' = 'license'
 LIMIT 2;
ROLLBACK;
