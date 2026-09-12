-- Negative controls for the round-8 fixes. Everything rolls back.
BEGIN;

-- ── fixture: one studio, one project, two seats on ONE number ──────────────
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
VALUES ('a1000000-0000-4000-8000-0000000000f1','r8probe@test.invalid','',NOW(),NOW(),NOW(),
        '00000000-0000-0000-0000-000000000000','authenticated','authenticated');
-- profiles row is minted by the auth.users trigger; only fill the name.
UPDATE profiles SET full_name='R8 Probe' WHERE id='a1000000-0000-4000-8000-0000000000f1';
INSERT INTO organizations (id, type, name, slug, status, created_at, updated_at)
VALUES ('b1000000-0000-4000-8000-0000000000f1','design_studio','R8 Probe Studio','r8-probe-studio','active',NOW(),NOW());
INSERT INTO organization_members (user_id, organization_id, role, status, joined_at, created_at, updated_at)
VALUES ('a1000000-0000-4000-8000-0000000000f1','b1000000-0000-4000-8000-0000000000f1','owner','active',NOW(),NOW(),NOW());
INSERT INTO projects (id, name, designer_id, studio_id, created_by, status, created_at, updated_at)
VALUES ('d1000000-0000-4000-8000-0000000000f1','R8 Probe Project',
        'a1000000-0000-4000-8000-0000000000f1','b1000000-0000-4000-8000-0000000000f1',
        'a1000000-0000-4000-8000-0000000000f1','active',NOW(),NOW());

INSERT INTO project_parties (id, project_id, party_kind, display_name, phone,
                             sms_consent_status, sms_consent_source, sms_consent_evidence,
                             sms_consent_recorded_at, sms_consent_recorded_by, sms_consented_at)
VALUES
  -- the sibling seat: the studio's kickoff consent form
  ('e1000000-0000-4000-8000-0000000000a1','d1000000-0000-4000-8000-0000000000f1','sub','Granted Seat',
   '612-555-0901','granted','written','Signed consent form at kickoff',
   '2026-01-02 00:00:00+00','a1000000-0000-4000-8000-0000000000f1','2026-01-02 00:00:00+00'),
  -- the sourceless refusal the portal and the fold really write
  ('e1000000-0000-4000-8000-0000000000a2','d1000000-0000-4000-8000-0000000000f1','sub','Refusing Seat',
   '612-555-0901','opted_out',NULL,NULL,NULL,NULL,NULL);

\echo '=== A1. SHIPPED mirror (R-AQ): the fold, then both seats ==='
SELECT public.backfill_channel_consent_from_parties() AS folded;
SELECT status, refusal_unanswered, opt_out_source, source
  FROM studio_channel_consent
 WHERE organization_id='b1000000-0000-4000-8000-0000000000f1';
SELECT display_name, sms_consent_status, sms_consent_source, sms_consent_evidence,
       sms_consent_recorded_at
  FROM project_parties
 WHERE project_id='d1000000-0000-4000-8000-0000000000f1' ORDER BY display_name;


\echo '=== A2. NEGATIVE CONTROL: the pre-R-AQ mirror (every CASE falls to COALESCE) ==='
-- One token reverts the fix: with v_refusal_wordless pinned false, every CASE
-- in the UPDATE takes its ELSE branch, which IS the old COALESCE body.
DO $$
DECLARE d text;
BEGIN
  d := pg_get_functiondef('public.mirror_channel_consent_to_parties()'::regprocedure);
  d := replace(d, 'v_refusal_wordless := NEW.opt_out_source IS NULL;',
                  'v_refusal_wordless := false;  -- NEGATIVE CONTROL');
  ASSERT d LIKE '%NEGATIVE CONTROL%', 'the control did not patch';
  EXECUTE d;
END $$;

UPDATE project_parties
   SET sms_consent_status = 'granted', sms_consent_source = 'written',
       sms_consent_evidence = 'Signed consent form at kickoff',
       sms_consent_recorded_at = '2026-01-02 00:00:00+00'
 WHERE id = 'e1000000-0000-4000-8000-0000000000a1';
DELETE FROM studio_channel_consent WHERE organization_id='b1000000-0000-4000-8000-0000000000f1';
SELECT public.backfill_channel_consent_from_parties() AS folded_again;
SELECT display_name, sms_consent_status, sms_consent_source, sms_consent_evidence,
       sms_consent_recorded_at
  FROM project_parties
 WHERE project_id='d1000000-0000-4000-8000-0000000000f1' ORDER BY display_name;

-- ═══════════════════════════════════════════════════════════════════════════
-- B. R-AR: flipping the REFERENCED card
-- ═══════════════════════════════════════════════════════════════════════════
INSERT INTO studio_contacts (id, organization_id, entity_kind, contact_kind,
                             full_name, company_name, created_by)
VALUES
  ('c1000000-0000-4000-8000-0000000000f1','b1000000-0000-4000-8000-0000000000f1',
   'person','sub','Held Person','Held Person LLC','a1000000-0000-4000-8000-0000000000f1'),
  ('c1000000-0000-4000-8000-0000000000f2','b1000000-0000-4000-8000-0000000000f1',
   'company','gc',NULL,'Holder GC','a1000000-0000-4000-8000-0000000000f1');
INSERT INTO studio_contact_channels (owner_type, owner_id, channel_kind, value)
VALUES ('person','c1000000-0000-4000-8000-0000000000f1','mobile','612-555-0902');
UPDATE studio_contacts SET site_contact_person_id='c1000000-0000-4000-8000-0000000000f1'
 WHERE id='c1000000-0000-4000-8000-0000000000f2';
INSERT INTO studio_contact_rules (subject_type, subject_id, route_to_person_id, reason)
VALUES ('company','c1000000-0000-4000-8000-0000000000f2',
        'c1000000-0000-4000-8000-0000000000f1','Write the PM instead');

\echo '=== B1. SHIPPED guard: the flip is refused, with a hint naming the holders ==='
DO $$
DECLARE raised text; hint text;
BEGIN
  BEGIN
    UPDATE studio_contacts SET entity_kind='company'
     WHERE id='c1000000-0000-4000-8000-0000000000f1';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS raised = MESSAGE_TEXT, hint = PG_EXCEPTION_HINT;
  END;
  RAISE NOTICE 'raised: %', COALESCE(raised,'<none>');
  RAISE NOTICE 'hint:   %', COALESCE(hint,'<none>');
END $$;

\echo '=== B2. NEGATIVE CONTROL: drop the guard, flip the card, count the wreckage ==='
DROP TRIGGER assert_studio_contact_identity_stable_trg ON public.studio_contacts;
UPDATE studio_contacts SET entity_kind='company'
 WHERE id='c1000000-0000-4000-8000-0000000000f1';
SELECT
  (SELECT count(*) FROM studio_contact_channels c
     JOIN studio_contacts sc ON sc.id=c.owner_id
    WHERE c.owner_id='c1000000-0000-4000-8000-0000000000f1'
      AND c.owner_type <> sc.entity_kind)                       AS channels_owner_type_wrong,
  (SELECT count(*) FROM studio_contacts sc
     JOIN studio_contacts t ON t.id=sc.site_contact_person_id
    WHERE t.entity_kind <> 'person')                            AS designation_names_a_firm,
  (SELECT count(*) FROM studio_contact_rules r
     JOIN studio_contacts t ON t.id=r.route_to_person_id
    WHERE t.entity_kind <> 'person')                            AS route_to_a_firm;

ROLLBACK;
