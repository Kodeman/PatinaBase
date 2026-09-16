-- W3 round-3 adversarial probe, part 3: the absorbed card's own number after a
-- merge. One transaction, ROLLBACKed. Local only.
BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.assume_user(p_user_id UUID)
RETURNS VOID AS $$
BEGIN
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', p_user_id::text, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
END; $$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION pg_temp.assume_user(UUID) TO PUBLIC;
CREATE OR REPLACE FUNCTION pg_temp.reset_role() RETURNS VOID AS $$
BEGIN EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims', NULL, true); END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION pg_temp.reset_role() TO PUBLIC;

-- Two cards for one human in the SEEDED studio, matched on email (rule 3),
-- each with its own number, so the seeded Okonkwo project can carry the seat.
INSERT INTO public.studio_contacts
  (id, organization_id, entity_kind, contact_kind, full_name, phone, email, created_by, created_at) VALUES
  ('fc100000-0000-4000-8000-000000000001','b0000000-0000-0000-0000-000000000001','person','sub','Pete Survivor','(612) 555-0871','pete2@rusk.test','a0000000-0000-0000-0000-000000000004','2025-01-01'),
  ('fc100000-0000-4000-8000-000000000002','b0000000-0000-0000-0000-000000000001','person','sub','Pete Duplicate','(612) 555-0872','pete2@rusk.test','a0000000-0000-0000-0000-000000000004','2026-01-01');

DO $$
DECLARE v_card uuid; v_seat uuid; n int;
BEGIN
  RAISE NOTICE 'I BEFORE the merge, a seat on +16125550872 resolves to card %',
    public.rolodex_card_for_party_phone('d0e00000-0000-0000-0000-00000000000a','+16125550872');

  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000004');
  PERFORM public.merge_studio_contacts(
    'fc100000-0000-4000-8000-000000000001','fc100000-0000-4000-8000-000000000002','email');

  PERFORM pg_temp.reset_role();
  RAISE NOTICE 'I AFTER the merge, the SAME number resolves to card %',
    public.rolodex_card_for_party_phone('d0e00000-0000-0000-0000-00000000000a','+16125550872');
  RAISE NOTICE 'I  (the survivor''s own number still resolves to %)',
    public.rolodex_card_for_party_phone('d0e00000-0000-0000-0000-00000000000a','+16125550871');
END $$;

-- The ordinary "Add to the roster" write, on the number the studio just merged.
INSERT INTO public.project_parties
  (id, project_id, party_kind, display_name, phone, created_by)
VALUES ('fc200000-0000-4000-8000-000000000001','d0e00000-0000-0000-0000-00000000000a',
        'sub','Pete Rusk','(612) 555-0872','a0000000-0000-0000-0000-000000000004');

DO $$
DECLARE v uuid; n int;
BEGIN
  SELECT studio_contact_id INTO v FROM public.project_parties
   WHERE id = 'fc200000-0000-4000-8000-000000000001';
  RAISE NOTICE 'I the new seat was stamped with card % (NULL = uncarded)', v;

  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000004');
  SELECT count(*) INTO n FROM public.people_directory
   WHERE display_name IN ('Pete Survivor','Pete Rusk','Pete Duplicate');
  RAISE NOTICE 'I Directory rows for this one human after the merge: %', n;
  FOR v IN SELECT person_id FROM public.people_directory
            WHERE display_name IN ('Pete Survivor','Pete Rusk','Pete Duplicate') LOOP
    RAISE NOTICE 'I   row: % (%)', v,
      (SELECT role || ' · ' || display_name FROM public.people_directory p WHERE p.person_id = v LIMIT 1);
  END LOOP;
  PERFORM pg_temp.reset_role();
END $$;

ROLLBACK;
