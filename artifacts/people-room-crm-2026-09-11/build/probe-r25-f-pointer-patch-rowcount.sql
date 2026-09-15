\pset pager off
BEGIN;
SET LOCAL role authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub','cf100000-0000-0000-0000-000000000001','role','authenticated')::text, true) IS NOT NULL AS jwt_set;
DO $$ DECLARE n int; BEGIN
  UPDATE public.studio_contacts SET merged_into='d0e10000-0000-0000-0000-000000000008' WHERE id='d0e10000-0000-0000-0000-000000000012';
  GET DIAGNOSTICS n = ROW_COUNT; RAISE NOTICE 'outsider pointer PATCH rows=%', n;
END $$;
SELECT 'outsider left it alone' AS check, merged_into IS NULL AS still_null FROM public.studio_contacts WHERE id='d0e10000-0000-0000-0000-000000000012';
ROLLBACK;

-- now as a real member of the studio
BEGIN;
SET LOCAL role authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub','a0000000-0000-0000-0000-000000000004','role','authenticated')::text, true) IS NOT NULL AS jwt_set;
DO $$ DECLARE n int; BEGIN
  UPDATE public.studio_contacts SET merged_into='d0e10000-0000-0000-0000-000000000008' WHERE id='d0e10000-0000-0000-0000-000000000012';
  GET DIAGNOSTICS n = ROW_COUNT; RAISE NOTICE 'OWNER pointer PATCH rows=%', n;
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'OWNER pointer PATCH refused: %', SQLERRM;
END $$;
ROLLBACK;
