\pset pager off
BEGIN;
-- ── Studio B fixture (Phase One Synthetic Studio), staged as service_role ──
-- a firm card, a lapsed gating COI, a seat, an authority grant, a site access card
INSERT INTO public.studio_contacts (id, organization_id, entity_kind, company_name, contact_kind, created_by, phone, phone_e164)
VALUES ('e9000000-0000-4000-8000-00000000fa01','cf120000-0000-4000-8000-000000000001','company',
        'Beta Electric','vendor','cf100000-0000-4000-8000-000000000001','(612) 555-9001','+16125559001');
INSERT INTO public.studio_contacts (id, organization_id, entity_kind, full_name, contact_kind, created_by, company_id, phone, phone_e164)
VALUES ('e9000000-0000-4000-8000-00000000fa02','cf120000-0000-4000-8000-000000000001','person',
        'Beta Person','trade','cf100000-0000-4000-8000-000000000001','e9000000-0000-4000-8000-00000000fa01','(612) 555-9002','+16125559002');

INSERT INTO public.studio_compliance_documents
  (id, organization_id, holder_type, holder_id, doc_type, expires_on, blocks)
VALUES ('e9000000-0000-4000-8000-00000000ffe1','cf120000-0000-4000-8000-000000000001','company',
        'e9000000-0000-4000-8000-00000000fa01','coi_gl','2020-01-01', ARRAY['site_access','draw']);

-- studio B project + seat
INSERT INTO public.projects (id, name, designer_id, studio_id, status, created_by)
VALUES ('e9000000-0000-4000-8000-00000000ffa1','Beta job','cf100000-0000-4000-8000-000000000001',
       'cf120000-0000-4000-8000-000000000001','active','cf100000-0000-4000-8000-000000000001');
INSERT INTO public.project_parties
  (id, project_id, party_kind, display_name, studio_contact_id, phone, phone_e164, stage, company_id)
VALUES ('e9000000-0000-4000-8000-00000000ffb1','e9000000-0000-4000-8000-00000000ffa1','sub',
        'Beta Person','e9000000-0000-4000-8000-00000000fa02','(612) 555-9002','+16125559002','active',
        'e9000000-0000-4000-8000-00000000fa01');
INSERT INTO public.project_party_authority (id, engagement_id, scope, threshold_cents)
VALUES ('e9000000-0000-4000-8000-00000000ffc1','e9000000-0000-4000-8000-00000000ffb1','money', 999900);
INSERT INTO public.project_site_access_cards (id, project_id, lockbox_version, site_hours, key_holder_engagement_id)
VALUES ('e9000000-0000-4000-8000-00000000ffd1','e9000000-0000-4000-8000-00000000ffa1','beta third code',
        'Weekdays 7-4','e9000000-0000-4000-8000-00000000ffb1');
-- a live field link on studio B's seat
INSERT INTO public.field_link_tokens (party_id, project_id, token_hash, expires_at, status)
VALUES ('e9000000-0000-4000-8000-00000000ffb1','e9000000-0000-4000-8000-00000000ffa1',
        repeat('b',64), now() + interval '30 days', 'active');
-- a recorded refusal in studio B for that number
INSERT INTO public.studio_channel_consent
  (organization_id, channel_kind, channel_value, status, opt_out_at, source)
VALUES ('cf120000-0000-4000-8000-000000000001','sms','+16125559002','opted_out', now(), 'inbound_sms')
ON CONFLICT DO NOTHING;

\echo '=== A) as studio A owner (designer@patina.dev): can anything of studio B be read? ==='
SET LOCAL role authenticated;
SET LOCAL request.jwt.claims TO '{"sub":"a0000000-0000-0000-0000-000000000004","role":"authenticated"}';
SELECT
 (SELECT count(*) FROM public.studio_compliance_documents WHERE organization_id='cf120000-0000-4000-8000-000000000001') AS b_docs,
 (SELECT count(*) FROM public.project_party_authority WHERE id='e9000000-0000-4000-8000-00000000ffc1') AS b_authority,
 (SELECT count(*) FROM public.project_site_access_cards WHERE id='e9000000-0000-4000-8000-00000000ffd1') AS b_site_card,
 (SELECT count(*) FROM public.people_directory WHERE person_id IN ('e9000000-0000-4000-8000-00000000fa01','e9000000-0000-4000-8000-00000000fa02','e9000000-0000-4000-8000-00000000ffb1')) AS b_directory_rows,
 (SELECT count(*) FROM public.people_directory_seats WHERE seat_id='e9000000-0000-4000-8000-00000000ffb1') AS b_seats,
 (SELECT count(*) FROM public.v_access_grants WHERE scope_id='e9000000-0000-4000-8000-00000000ffa1' OR subject_id='e9000000-0000-4000-8000-00000000ffb1') AS b_grants,
 (SELECT count(*) FROM public.v_access_grants WHERE scope_id='cf120000-0000-4000-8000-000000000001') AS b_member_grants;

\echo '--- the functions, asked studio B questions by a studio A caller ---'
SELECT public.compliance_state('e9000000-0000-4000-8000-00000000fa01')        AS b_paper_word,
       public.identity_consent_status('cf120000-0000-4000-8000-000000000001',
             'e9000000-0000-4000-8000-00000000fa02','+16125559002')            AS b_identity_consent,
       public.channel_consent_status('cf120000-0000-4000-8000-000000000001','sms','+16125559002') AS b_record_verdict,
       public.identity_seat_count('e9000000-0000-4000-8000-00000000fa02')      AS b_seat_count,
       public.reach_state_for_identity(NULL,'e9000000-0000-4000-8000-00000000fa02') AS b_reach,
       public.contact_rule_summary('person','e9000000-0000-4000-8000-00000000fa02') AS b_rule,
       public.project_designer('e9000000-0000-4000-8000-00000000ffa1')         AS b_designer_oracle,
       public.project_party_org('e9000000-0000-4000-8000-00000000ffb1')        AS b_org_oracle;

\echo '--- writes into studio B, attempted by a studio A member ---'
DO $$
BEGIN
  BEGIN
    INSERT INTO public.studio_compliance_documents (organization_id, holder_type, holder_id, doc_type, expires_on)
    VALUES ('cf120000-0000-4000-8000-000000000001','company','e9000000-0000-4000-8000-00000000fa01','w9', NULL);
    RAISE NOTICE 'A wrote a document into B: LEAK';
  EXCEPTION WHEN others THEN RAISE NOTICE 'A -> B document refused: %', SQLERRM; END;
  BEGIN
    UPDATE public.studio_compliance_documents SET blocks='{}'
     WHERE id='e9000000-0000-4000-8000-00000000ffe1';
    RAISE NOTICE 'A updated B''s document rows: %', (SELECT count(*) FROM public.studio_compliance_documents WHERE id='e9000000-0000-4000-8000-00000000ffe1');
  EXCEPTION WHEN others THEN RAISE NOTICE 'A -> B document update refused: %', SQLERRM; END;
  BEGIN
    UPDATE public.project_site_access_cards SET lockbox_version='hijacked'
     WHERE id='e9000000-0000-4000-8000-00000000ffd1';
    RAISE NOTICE 'A updated B''s site card (rows matched by RLS): %', (SELECT count(*) FROM public.project_site_access_cards WHERE id='e9000000-0000-4000-8000-00000000ffd1');
  EXCEPTION WHEN others THEN RAISE NOTICE 'A -> B site card refused: %', SQLERRM; END;
  BEGIN
    INSERT INTO public.project_party_authority (engagement_id, scope) VALUES ('e9000000-0000-4000-8000-00000000ffb1','selections');
    RAISE NOTICE 'A wrote an authority grant on B''s seat: LEAK';
  EXCEPTION WHEN others THEN RAISE NOTICE 'A -> B authority refused: %', SQLERRM; END;
  BEGIN
    PERFORM public.create_field_link('e9000000-0000-4000-8000-00000000ffb1');
    RAISE NOTICE 'A minted a field link on B''s seat: LEAK';
  EXCEPTION WHEN others THEN RAISE NOTICE 'A -> B mint refused: %', SQLERRM; END;
END $$;

\echo '=== B) as studio B owner (alice): can anything of studio A be read? ==='
RESET role;
SET LOCAL role authenticated;
SET LOCAL request.jwt.claims TO '{"sub":"cf100000-0000-4000-8000-000000000001","role":"authenticated"}';
SELECT
 (SELECT count(*) FROM public.studio_compliance_documents WHERE organization_id='b0000000-0000-0000-0000-000000000001') AS a_docs,
 (SELECT count(*) FROM public.project_party_authority) AS all_authority_visible,
 (SELECT count(*) FROM public.project_site_access_cards) AS all_site_cards_visible,
 (SELECT count(*) FROM public.people_directory) AS directory_rows,
 (SELECT count(*) FROM public.people_directory_seats) AS seats_rows,
 (SELECT count(*) FROM public.v_access_grants) AS grants_rows;
\echo '--- studio A questions asked by a studio B caller ---'
SELECT public.compliance_state((SELECT id FROM public.studio_contacts WHERE company_name='Northgate Electric' LIMIT 1)) AS a_paper_word;
ROLLBACK;
