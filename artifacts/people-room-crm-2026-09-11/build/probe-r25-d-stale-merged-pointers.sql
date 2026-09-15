\pset pager off
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL role authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub','a0000000-0000-0000-0000-000000000004','role','authenticated')::text, true);

-- fold Pete Rusk (0012) into Erin Sato (0008): two person cards in the same studio
SELECT public.merge_studio_contacts(
  'd0e10000-0000-0000-0000-000000000008'::uuid,
  'd0e10000-0000-0000-0000-000000000012'::uuid,
  'manual') AS survivor;

-- now try the three stale-id writes an ordinary member can still make
-- (a) seat's studio_contact_id -> merged card  (expected: refused)
DO $$ BEGIN
  BEGIN
    UPDATE public.project_parties SET studio_contact_id='d0e10000-0000-0000-0000-000000000012'
     WHERE id=(SELECT id FROM public.project_parties WHERE studio_contact_id IS NOT NULL LIMIT 1);
    RAISE NOTICE '(a) studio_contact_id -> merged card: LANDED (no guard)';
  EXCEPTION WHEN OTHERS THEN RAISE NOTICE '(a) refused: %', SQLERRM;
  END;
END $$;

-- (b) seat's warranty_contact_person_id -> merged card
DO $$
DECLARE v_seat uuid;
BEGIN
  SELECT pp.id INTO v_seat FROM public.project_parties pp
    JOIN public.projects pj ON pj.id=pp.project_id
   WHERE pj.studio_id='b0000000-0000-0000-0000-000000000001' LIMIT 1;
  BEGIN
    UPDATE public.project_parties SET warranty_contact_person_id='d0e10000-0000-0000-0000-000000000012' WHERE id=v_seat;
    RAISE NOTICE '(b) warranty_contact_person_id -> merged card: LANDED (no guard)';
  EXCEPTION WHEN OTHERS THEN RAISE NOTICE '(b) refused: %', SQLERRM;
  END;
END $$;

-- (c) firm card designations -> merged card
DO $$ BEGIN
  BEGIN
    UPDATE public.studio_contacts SET signer_person_id='d0e10000-0000-0000-0000-000000000012'
     WHERE id='d0e20000-0000-0000-0000-000000000003';
    RAISE NOTICE '(c) signer_person_id -> merged card: LANDED (no guard)';
  EXCEPTION WHEN OTHERS THEN RAISE NOTICE '(c) refused: %', SQLERRM;
  END;
END $$;

-- (d) household member -> merged card
DO $$ BEGIN
  BEGIN
    INSERT INTO public.client_households (organization_id, designer_id, display_name, member_person_ids)
    VALUES ('b0000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000004','Probe HH',
            ARRAY['d0e10000-0000-0000-0000-000000000012'::uuid]);
    RAISE NOTICE '(d) household member -> merged card: LANDED (no guard)';
  EXCEPTION WHEN OTHERS THEN RAISE NOTICE '(d) refused: %', SQLERRM;
  END;
END $$;

-- (e) bid_quoted_by_person_id -> merged card
DO $$
DECLARE v_seat uuid;
BEGIN
  SELECT pp.id INTO v_seat FROM public.project_parties pp
    JOIN public.projects pj ON pj.id=pp.project_id
   WHERE pj.studio_id='b0000000-0000-0000-0000-000000000001' LIMIT 1;
  BEGIN
    UPDATE public.project_parties SET bid_quoted_by_person_id='d0e10000-0000-0000-0000-000000000012' WHERE id=v_seat;
    RAISE NOTICE '(e) bid_quoted_by_person_id -> merged card: LANDED (no guard)';
  EXCEPTION WHEN OTHERS THEN RAISE NOTICE '(e) refused: %', SQLERRM;
  END;
END $$;
ROLLBACK;
