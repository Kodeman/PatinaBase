\pset pager off
BEGIN;
-- ── Studio Beta, its own designer, project, rolodex and W1b rows ───────────
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at,
                        raw_app_meta_data, raw_user_meta_data, aud, role)
VALUES ('bb000000-0000-0000-0000-0000000000b1','beta@example.test','x',now(),now(),now(),
        '{"provider":"email","providers":["email"]}','{}','authenticated','authenticated');
INSERT INTO organizations (id, name, slug, type)
VALUES ('bb000000-0000-0000-0000-0000000000c1','Beta Studio','beta-studio','design_studio');
INSERT INTO organization_members (organization_id, user_id, role, status)
VALUES ('bb000000-0000-0000-0000-0000000000c1','bb000000-0000-0000-0000-0000000000b1','owner','active');
INSERT INTO projects (id, name, designer_id, studio_id, status, created_by)
VALUES ('bb000000-0000-0000-0000-0000000000d1','Beta job','bb000000-0000-0000-0000-0000000000b1','bb000000-0000-0000-0000-0000000000c1','active','bb000000-0000-0000-0000-0000000000b1');
INSERT INTO studio_contacts (id, organization_id, entity_kind, contact_kind, company_name, phone, phone_e164, created_by)
VALUES ('bb000000-0000-0000-0000-0000000000e1','bb000000-0000-0000-0000-0000000000c1','company','sub','Beta Electric','+16125558801','+16125558801','bb000000-0000-0000-0000-0000000000b1');
INSERT INTO studio_compliance_documents (organization_id, holder_type, holder_id, doc_type, expires_on, blocks)
VALUES ('bb000000-0000-0000-0000-0000000000c1','company','bb000000-0000-0000-0000-0000000000e1','coi_gl', CURRENT_DATE - 5, ARRAY['site_access']);
INSERT INTO project_parties (id, project_id, party_kind, display_name, phone, phone_e164, company_id)
VALUES ('bb000000-0000-0000-0000-0000000000f1','bb000000-0000-0000-0000-0000000000d1','sub','Beta Bob','+16125558802','+16125558802','bb000000-0000-0000-0000-0000000000e1');
INSERT INTO project_party_authority (engagement_id, scope, threshold_cents)
VALUES ('bb000000-0000-0000-0000-0000000000f1','money',999900);
INSERT INTO project_site_access_cards (project_id, lockbox_version, site_hours, key_holder_engagement_id)
VALUES ('bb000000-0000-0000-0000-0000000000d1','beta v3','8-4','bb000000-0000-0000-0000-0000000000f1');
INSERT INTO studio_channel_consent (organization_id, channel_kind, channel_value, status, opt_out_at, opt_out_source)
VALUES ('bb000000-0000-0000-0000-0000000000c1','sms','+16125558802','opted_out', now(), 'inbound_sms');

-- ── Read it all as the ALPHA designer (designer@patina.dev) ────────────────
SET LOCAL role authenticated;
SET LOCAL request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-000000000004","role":"authenticated"}';
\echo '=== Alpha designer reading Beta rows (every number must be 0) ==='
SELECT
  (SELECT count(*) FROM studio_compliance_documents WHERE organization_id='bb000000-0000-0000-0000-0000000000c1') AS beta_docs,
  (SELECT count(*) FROM project_party_authority WHERE engagement_id='bb000000-0000-0000-0000-0000000000f1')        AS beta_authority,
  (SELECT count(*) FROM project_site_access_cards WHERE project_id='bb000000-0000-0000-0000-0000000000d1')         AS beta_cards,
  (SELECT count(*) FROM people_directory_seats WHERE seat_id='bb000000-0000-0000-0000-0000000000f1')               AS beta_seats,
  (SELECT count(*) FROM people_directory WHERE display_name IN ('Beta Bob','Beta Electric'))                        AS beta_dir,
  (SELECT count(*) FROM v_access_grants WHERE scope_id='bb000000-0000-0000-0000-0000000000d1')                      AS beta_grants;
\echo '=== compliance_state / channel_consent_status on Beta keys, asked by Alpha ==='
SELECT public.compliance_state('bb000000-0000-0000-0000-0000000000e1') AS beta_paper_as_alpha,
       public.channel_consent_status('bb000000-0000-0000-0000-0000000000c1','sms','+16125558802') AS beta_consent_as_alpha,
       public.identity_seat_count('+16125558802') AS beta_seat_count_as_alpha,
       public.contact_rule_summary('company','bb000000-0000-0000-0000-0000000000e1') AS beta_rule_as_alpha;
\echo '=== the definer ORACLES: what does an unrelated studio member learn? ==='
SELECT public.project_designer('bb000000-0000-0000-0000-0000000000d1') AS beta_designer_leaked,
       public.project_party_org('bb000000-0000-0000-0000-0000000000f1') AS beta_org_leaked,
       public.project_consent_org('bb000000-0000-0000-0000-0000000000d1') AS beta_org_leaked2;

-- ── and the reverse: Beta reading Alpha ───────────────────────────────────
RESET role;
SET LOCAL role authenticated;
SET LOCAL request.jwt.claims = '{"sub":"bb000000-0000-0000-0000-0000000000b1","role":"authenticated"}';
\echo '=== Beta owner reading Alpha rows (every number must be 0) ==='
SELECT
  (SELECT count(*) FROM studio_compliance_documents WHERE organization_id='b0000000-0000-0000-0000-000000000001') AS alpha_docs,
  (SELECT count(*) FROM people_directory)                                                                          AS alpha_dir_rows_visible,
  (SELECT count(*) FROM people_directory_seats)                                                                    AS alpha_seat_rows_visible,
  (SELECT count(*) FROM project_site_access_cards)                                                                 AS alpha_cards_visible,
  (SELECT count(*) FROM project_party_authority)                                                                   AS alpha_authority_visible,
  (SELECT count(*) FROM v_access_grants)                                                                           AS grants_visible;
\echo '=== Beta reading its OWN rows (sanity: must be non-zero) ==='
SELECT
  (SELECT count(*) FROM studio_compliance_documents) AS own_docs,
  (SELECT count(*) FROM project_party_authority)     AS own_authority,
  (SELECT count(*) FROM project_site_access_cards)   AS own_cards,
  (SELECT count(*) FROM people_directory_seats)      AS own_seats,
  (SELECT paper_state FROM people_directory WHERE display_name='Beta Electric') AS own_paper,
  (SELECT consent_status FROM people_directory_seats WHERE seat_id='bb000000-0000-0000-0000-0000000000f1') AS own_seat_consent;
ROLLBACK;
