-- r15 probe D: a member of ANOTHER studio against W3's three new tables and
-- the merge/household RPCs.
BEGIN;
-- studio A = b0000000-...-0001 (the seeded book). studio B's owner is
-- a0000000-0000-0000-0000-000000000003 in 75a3346f-... (a non-design org) —
-- use cf100000-...-0001, owner of cf120000-...-0001, a foreign design studio.
INSERT INTO client_households (id, organization_id, designer_id, display_name, member_person_ids, co_threshold_cents)
VALUES ('cc000000-0000-4000-8000-000000000001','b0000000-0000-0000-0000-000000000001',
        'a0000000-0000-0000-0000-000000000004','Studio A household',
        ARRAY['d0e10000-0000-0000-0000-000000000004']::uuid[], 250000);
INSERT INTO studio_contact_merges (organization_id, survivor_id, merged_id, matched_on)
VALUES ('b0000000-0000-0000-0000-000000000001','d0e10000-0000-0000-0000-000000000004','d0e10000-0000-0000-0000-000000000005','manual');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  '{"sub":"cf100000-0000-4000-8000-000000000001","role":"authenticated"}', true);

SELECT 'D-a foreign member reads studio A households: ' || count(*)::text FROM client_households;
SELECT 'D-b foreign member reads studio A merge lineage: ' || count(*)::text FROM studio_contact_merges;
SELECT 'D-c foreign member reads studio A notices: ' || count(*)::text FROM studio_compliance_notices;
SELECT 'D-d foreign member reads studio A bid seats: ' || count(*)::text
  FROM project_parties WHERE project_id='d0e00000-0000-0000-0000-00000000000a';
DO $$ DECLARE e text; BEGIN
  BEGIN PERFORM public.merge_studio_contacts('d0e10000-0000-0000-0000-000000000001','d0e10000-0000-0000-0000-000000000002','manual'); e:='ACCEPTED';
  EXCEPTION WHEN OTHERS THEN e := SQLERRM; END;
  RAISE NOTICE 'D-e foreign member merges studio A cards: %', e;
END $$;
DO $$ DECLARE e text; BEGIN
  BEGIN PERFORM public.add_household_member('cc000000-0000-4000-8000-000000000001','d0e10000-0000-0000-0000-000000000005','client_rep',NULL); e:='ACCEPTED';
  EXCEPTION WHEN OTHERS THEN e := SQLERRM; END;
  RAISE NOTICE 'D-f foreign member adds to studio A household: %', e;
END $$;
DO $$ DECLARE e text; BEGIN
  BEGIN PERFORM public.set_household_threshold('cc000000-0000-4000-8000-000000000001', 999999); e:='ACCEPTED';
  EXCEPTION WHEN OTHERS THEN e := SQLERRM; END;
  RAISE NOTICE 'D-g foreign member moves studio A threshold: %', e;
END $$;
DO $$ DECLARE e text; BEGIN
  BEGIN PERFORM public.sweep_compliance_expiries(); e:='ACCEPTED';
  EXCEPTION WHEN OTHERS THEN e := SQLERRM; END;
  RAISE NOTICE 'D-h foreign member runs the sweep: %', e;
END $$;
DO $$ DECLARE e text; BEGIN
  BEGIN PERFORM public.archive_studio_contact('d0e10000-0000-0000-0000-000000000004'); e:='ACCEPTED';
  EXCEPTION WHEN OTHERS THEN e := SQLERRM; END;
  RAISE NOTICE 'D-i foreign member archives a studio A card: %', e;
END $$;
SELECT 'D-j foreign member resolves a studio A merged id: ' ||
       COALESCE(public.resolve_merged_contact('d0e10000-0000-0000-0000-000000000005')::text,'NULL');
ROLLBACK;
