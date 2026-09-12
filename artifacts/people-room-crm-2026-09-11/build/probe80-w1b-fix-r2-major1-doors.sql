-- probe80 — w1b final review r2 MAJOR-1: both doors, walked as a PLAIN MEMBER
-- of the seeded studio, exactly as the review walked them. Each door is tried,
-- refused, and the card's word re-read to show the lapse is still standing.
-- Then each guard is removed in turn to prove it is the thing doing the work.
BEGIN;
CREATE OR REPLACE FUNCTION pg_temp.assume_user(p_user_id UUID) RETURNS VOID AS $$
BEGIN
  PERFORM set_config('role','authenticated',true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub',p_user_id::text,'role','authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
END; $$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION pg_temp.assume_user(UUID) TO PUBLIC;
CREATE OR REPLACE FUNCTION pg_temp.reset_role() RETURNS VOID AS $$
BEGIN EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims',NULL,true); END; $$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION pg_temp.reset_role() TO PUBLIC;

INSERT INTO auth.users (id, instance_id, email, encrypted_password, email_confirmed_at, aud, role, created_at, updated_at)
VALUES ('aaaa1111-0000-4000-8000-00000000f001','00000000-0000-0000-0000-000000000000','plainmember@example.test','x',now(),'authenticated','authenticated',now(),now())
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.profiles (id, email, full_name) VALUES ('aaaa1111-0000-4000-8000-00000000f001','plainmember@example.test','Plain Member') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.organization_members (user_id, organization_id, role, status, joined_at)
VALUES ('aaaa1111-0000-4000-8000-00000000f001','b0000000-0000-0000-0000-000000000001','member','active',now())
ON CONFLICT (user_id, organization_id) DO UPDATE SET role='member', status='active';

SELECT pg_temp.assume_user('aaaa1111-0000-4000-8000-00000000f001');

\echo '=== 0. what the room prints before any act (the fixture'\''s G-14 fact) ==='
SELECT display_name, paper_state FROM public.people_directory
 WHERE display_name IN ('Northgate Electric','Dana Kowalski') ORDER BY display_name;

\echo ''
\echo '=== 1. DOOR (a): record the renewal without typing the date ==='
DO $$
DECLARE raised text; v_org uuid; v_firm uuid;
BEGIN
  SELECT id, organization_id INTO v_firm, v_org FROM public.studio_contacts
   WHERE company_name = 'Northgate Electric';
  BEGIN
    INSERT INTO public.studio_compliance_documents
      (organization_id, holder_type, holder_id, doc_type, issuer, blocks)
    VALUES (v_org,'company',v_firm,'coi_gl','Acme Mutual (renewal, no date typed)',
            ARRAY['site_access','draw']);
    raised := 'ACCEPTED';
  EXCEPTION WHEN OTHERS THEN raised := SQLERRM;
  END;
  RAISE NOTICE 'undated coi_gl as a member -> %', raised;
END $$;
SELECT display_name, paper_state AS after_door_a FROM public.people_directory
 WHERE display_name IN ('Northgate Electric','Dana Kowalski') ORDER BY display_name;

\echo ''
\echo '=== 2. DOOR (b): the two-row supersede cycle ==='
DO $$
DECLARE raised text; v_org uuid; v_firm uuid; v_a uuid; v_b uuid;
BEGIN
  SELECT id, organization_id INTO v_firm, v_org FROM public.studio_contacts
   WHERE company_name = 'Northgate Electric';
  SELECT id INTO v_a FROM public.studio_compliance_documents
   WHERE holder_id = v_firm AND doc_type = 'coi_gl' AND expires_on = DATE '2026-03-31';
  INSERT INTO public.studio_compliance_documents
    (organization_id, holder_type, holder_id, doc_type, expires_on, blocks)
  VALUES (v_org,'company',v_firm,'coi_gl', DATE '2026-03-31', ARRAY['site_access','draw'])
  RETURNING id INTO v_b;
  UPDATE public.studio_compliance_documents SET superseded_by = v_b WHERE id = v_a;
  RAISE NOTICE 'A -> B (a legitimate supersede of one duplicate by the other): accepted';
  BEGIN
    UPDATE public.studio_compliance_documents SET superseded_by = v_a WHERE id = v_b;
    raised := 'ACCEPTED';
  EXCEPTION WHEN OTHERS THEN raised := SQLERRM;
  END;
  RAISE NOTICE 'B -> A (the edge that closes the loop) -> %', raised;
END $$;
SELECT display_name, paper_state AS after_door_b FROM public.people_directory
 WHERE display_name IN ('Northgate Electric','Dana Kowalski') ORDER BY display_name;
\echo '    and the record: the 2026-03-31 lapse is still on file and still counted'
SELECT doc_type, expires_on, blocks, (superseded_by IS NOT NULL) AS superseded
  FROM public.studio_compliance_documents
 WHERE holder_id = (SELECT id FROM public.studio_contacts WHERE company_name='Northgate Electric')
 ORDER BY doc_type, expires_on NULLS LAST;

\echo ''
\echo '=== 3. NEGATIVE CONTROL: drop the CHECK and door (a) reopens ==='
SELECT pg_temp.reset_role();
ALTER TABLE public.studio_compliance_documents
  DROP CONSTRAINT studio_compliance_documents_dated_expiry_check;
SELECT pg_temp.assume_user('aaaa1111-0000-4000-8000-00000000f001');
DO $$
DECLARE raised text; v_org uuid; v_firm uuid; v_new uuid;
BEGIN
  SELECT id, organization_id INTO v_firm, v_org FROM public.studio_contacts
   WHERE company_name = 'Northgate Electric';
  INSERT INTO public.studio_compliance_documents
    (organization_id, holder_type, holder_id, doc_type, issuer, blocks)
  VALUES (v_org,'company',v_firm,'coi_gl','Acme Mutual (no date typed)',
          ARRAY['site_access','draw'])
  RETURNING id INTO v_new;
  RAISE NOTICE 'with the CHECK gone, the undated coi_gl lands: %', v_new;
  BEGIN
    UPDATE public.studio_compliance_documents SET superseded_by = v_new
     WHERE holder_id = v_firm AND doc_type = 'coi_gl'
       AND expires_on = DATE '2026-03-31' AND superseded_by IS NULL;
    raised := 'ACCEPTED';
  EXCEPTION WHEN OTHERS THEN raised := SQLERRM;
  END;
  RAISE NOTICE 'the second write (mark the old one superseded) -> %', raised;
END $$;
\echo '    the trigger leg holds the door on its own — the word has not moved:'
SELECT display_name, paper_state AS with_check_dropped FROM public.people_directory
 WHERE display_name IN ('Northgate Electric','Dana Kowalski') ORDER BY display_name;
ROLLBACK;
