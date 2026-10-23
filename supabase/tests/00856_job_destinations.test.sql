-- 00856 / SQ-1769: job destinations contract. Real authenticated RPC path.
-- Every fixture and assertion is rolled back; never resets the shared DB.
BEGIN;
SET LOCAL statement_timeout = '45s';
SET LOCAL lock_timeout = '5s';

INSERT INTO auth.users(id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
SELECT id, 'sq1769-' || id || '@test.invalid', '', now(), now(), now(),
  '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'
FROM unnest(ARRAY[
  '85600000-0000-4000-8000-0000000000a1'::uuid,
  '85600000-0000-4000-8000-0000000000a2'::uuid,
  '85600000-0000-4000-8000-0000000000a3'::uuid,
  '85600000-0000-4000-8000-0000000000a4'::uuid
]) AS id;
INSERT INTO public.profiles(id, email, full_name)
SELECT id, email, 'SQ1769 designer' FROM auth.users WHERE email LIKE 'sq1769-%@test.invalid'
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.organizations(id, type, name, slug) VALUES
  ('85600000-0000-4000-8000-0000000000f1', 'design_studio', 'SQ1769 studio A', 'sq1769-studio-a'),
  ('85600000-0000-4000-8000-0000000000f2', 'design_studio', 'SQ1769 studio B', 'sq1769-studio-b');
INSERT INTO public.organization_members(user_id, organization_id, role, status) VALUES
  ('85600000-0000-4000-8000-0000000000a1', '85600000-0000-4000-8000-0000000000f1', 'owner', 'active'),
  ('85600000-0000-4000-8000-0000000000a2', '85600000-0000-4000-8000-0000000000f1', 'member', 'active'),
  ('85600000-0000-4000-8000-0000000000a3', '85600000-0000-4000-8000-0000000000f1', 'guest', 'active'),
  ('85600000-0000-4000-8000-0000000000a4', '85600000-0000-4000-8000-0000000000f2', 'owner', 'active');
INSERT INTO public.projects(id, name, designer_id, created_by, studio_id) VALUES
  ('85600000-0000-4000-8000-000000000001', 'SQ1769 job A', '85600000-0000-4000-8000-0000000000a1', '85600000-0000-4000-8000-0000000000a1', '85600000-0000-4000-8000-0000000000f1'),
  ('85600000-0000-4000-8000-000000000002', 'SQ1769 other job A', '85600000-0000-4000-8000-0000000000a1', '85600000-0000-4000-8000-0000000000a1', '85600000-0000-4000-8000-0000000000f1');
INSERT INTO public.studio_locations(id, organization_id, kind, label) VALUES
  ('85600000-0000-4000-8000-000000000011', '85600000-0000-4000-8000-0000000000f1', 'receiver', 'Original dock'),
  ('85600000-0000-4000-8000-000000000012', '85600000-0000-4000-8000-0000000000f1', 'site', 'Home'),
  ('85600000-0000-4000-8000-000000000013', '85600000-0000-4000-8000-0000000000f2', 'receiver', 'Other studio'),
  ('85600000-0000-4000-8000-000000000014', '85600000-0000-4000-8000-0000000000f1', 'storage', 'Unchosen');
INSERT INTO public.vendors(id, name) VALUES ('85600000-0000-4000-8000-000000000021', 'SQ1769 vendor');
INSERT INTO public.purchase_orders(id, designer_id, project_id, vendor_id, payment_pattern, status, sent_at, ship_to, ship_to_location_id)
VALUES ('85600000-0000-4000-8000-000000000101', '85600000-0000-4000-8000-0000000000a1',
  '85600000-0000-4000-8000-000000000001', '85600000-0000-4000-8000-000000000021', 'net_30',
  'confirmed', now(), 'Original dock\n1 Original Street', '85600000-0000-4000-8000-000000000011');
INSERT INTO public.project_ffe_items(id, project_id, name, status, purchase_order_id, design_disposition)
VALUES ('85600000-0000-4000-8000-000000000201', '85600000-0000-4000-8000-000000000001',
  'SQ1769 ordered chair', 'ordered', '85600000-0000-4000-8000-000000000101', 'selected');

CREATE FUNCTION pg_temp.raised(p_sql text) RETURNS text LANGUAGE plpgsql AS $$
BEGIN EXECUTE p_sql; RETURN NULL;
EXCEPTION WHEN OTHERS THEN RETURN SQLSTATE || ' ' || SQLERRM;
END $$;
GRANT EXECUTE ON FUNCTION pg_temp.raised(text) TO authenticated;

SET LOCAL ROLE authenticated;
DO $job_destinations_contract$
DECLARE
  v_project uuid := '85600000-0000-4000-8000-000000000001';
  v_other_project uuid := '85600000-0000-4000-8000-000000000002';
  v_org uuid := '85600000-0000-4000-8000-0000000000f1';
  v_home uuid := '85600000-0000-4000-8000-000000000012';
  v_other_studio uuid := '85600000-0000-4000-8000-000000000013';
  v_unchosen uuid := '85600000-0000-4000-8000-000000000014';
  v_item uuid := '85600000-0000-4000-8000-000000000201';
  v_po uuid := '85600000-0000-4000-8000-000000000101';
  v_location public.studio_locations;
  v_destination public.project_destination_locations;
  v_line public.project_ffe_items;
  v_before jsonb;
  v_error text;
  v_actor uuid;
BEGIN
  -- Non-member and guest cannot associate, remove, plan or read job places.
  FOREACH v_actor IN ARRAY ARRAY[
    '85600000-0000-4000-8000-0000000000a4'::uuid,
    '85600000-0000-4000-8000-0000000000a3'::uuid
  ] LOOP
    PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_actor, 'role', 'authenticated')::text, true);
    v_error := pg_temp.raised(format('SELECT public.add_project_destination_location(%L,%L)', v_project, v_home));
    ASSERT v_error LIKE '42501 %', 'non-member cannot associate a job place: ' || COALESCE(v_error, 'no error');
    v_error := pg_temp.raised(format('SELECT public.remove_project_destination_location(%L,%L)', v_project, v_home));
    ASSERT v_error LIKE '42501 %', 'non-member cannot remove a job place';
    v_error := pg_temp.raised(format('SELECT public.set_project_ffe_planned_destination(%L,%L)', v_item, v_home));
    ASSERT v_error LIKE '42501 %', 'non-member cannot set planned intent';
  END LOOP;

  PERFORM set_config('request.jwt.claims', '{"sub":"85600000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
  SELECT to_jsonb(po) INTO v_before FROM public.purchase_orders po WHERE id = v_po;
  ASSERT v_before IS NOT NULL, 'sent PO fixture is readable';
  v_location := public.upsert_studio_location(v_org, jsonb_build_object('id', v_home, 'isPrivateHome', true));
  ASSERT v_location.is_private_home, 'private flag round-trips true';
  v_location := public.upsert_studio_location(v_org, jsonb_build_object('id', v_home, 'label', 'Marked private home'));
  ASSERT v_location.is_private_home, 'omitted private flag is preserved';
  v_location := public.upsert_studio_location(v_org, '{"kind":"storage","label":"Default not private"}');
  ASSERT NOT v_location.is_private_home, 'private flag defaults false on create';
  v_location := public.upsert_studio_location(v_org, '{"kind":"site","label":"Created private","isPrivateHome":true}');
  ASSERT v_location.is_private_home, 'private flag is accepted on create';
  v_location := public.upsert_studio_location(v_org, jsonb_build_object('id', v_location.id, 'isPrivateHome', false));
  ASSERT NOT v_location.is_private_home, 'private flag round-trips false';

  v_error := pg_temp.raised(format('SELECT public.add_project_destination_location(%L,%L)', v_project, v_other_studio));
  ASSERT v_error LIKE '23514 %', 'cross-studio location is rejected';
  v_error := pg_temp.raised(format('SELECT public.set_project_ffe_planned_destination(%L,%L)', v_item, v_home));
  ASSERT v_error LIKE '23514 %', 'planned destination must be a job place';
  PERFORM public.add_project_destination_location(v_other_project, v_unchosen);
  v_error := pg_temp.raised(format('SELECT public.set_project_ffe_planned_destination(%L,%L)', v_item, v_unchosen));
  ASSERT v_error LIKE '23514 %', 'another job place cannot be planned for this job';

  v_destination := public.add_project_destination_location(v_project, v_home);
  ASSERT v_destination.created_by = auth.uid() AND v_destination.created_at IS NOT NULL,
    'association records its creator and time';
  PERFORM public.add_project_destination_location(v_project, v_home);
  ASSERT (SELECT count(*) = 1 FROM public.project_destination_locations WHERE project_id = v_project AND location_id = v_home),
    'duplicate association is idempotent';
  v_error := pg_temp.raised(format('INSERT INTO public.project_destination_locations(project_id, location_id) VALUES (%L,%L)', v_project, v_unchosen));
  ASSERT v_error LIKE '42501 %', 'direct association writes are refused';

  PERFORM set_config('request.jwt.claims', '{"sub":"85600000-0000-4000-8000-0000000000a2","role":"authenticated"}', true);
  ASSERT (SELECT is_private_home FROM public.studio_locations WHERE id = v_home),
    'other studio member can see the marked private home';
  ASSERT (SELECT count(*) = 1 FROM public.project_destination_locations WHERE project_id = v_project),
    'studio member can read job places';
  v_line := public.set_project_ffe_planned_destination(v_item, v_home);
  ASSERT v_line.planned_destination_location_id = v_home AND v_line.status = 'ordered',
    'planned destination round-trips without changing ordered status';
  v_line := public.set_project_ffe_planned_destination(v_item, NULL);
  ASSERT v_line.planned_destination_location_id IS NULL, 'NULL clears planned intent';
  PERFORM public.set_project_ffe_planned_destination(v_item, v_home);
  PERFORM public.archive_studio_location(v_home);
  v_error := pg_temp.raised(format('SELECT public.set_project_ffe_planned_destination(%L,%L)', v_item, v_home));
  ASSERT v_error LIKE '23514 %', 'archived place cannot be newly planned';
  v_error := pg_temp.raised(format('SELECT public.add_project_destination_location(%L,%L)', v_project, v_home));
  ASSERT v_error LIKE '23514 %', 'archived place cannot be associated';
  PERFORM public.archive_studio_location(v_home, false);
  PERFORM public.remove_project_destination_location(v_project, v_home);
  ASSERT NOT EXISTS (SELECT 1 FROM public.project_destination_locations WHERE project_id = v_project AND location_id = v_home),
    'job place is removed';
  ASSERT (SELECT planned_destination_location_id IS NULL AND project_id = v_project FROM public.project_ffe_items WHERE id = v_item),
    'removing a job place clears intent without changing the job';
  ASSERT (SELECT to_jsonb(po) = v_before FROM public.purchase_orders po WHERE id = v_po),
    'sent PO snapshot is unchanged by all destination edits';
  v_error := pg_temp.raised(format('SELECT public.set_purchase_order_ship_to_location(%L,%L)', v_po, v_home));
  ASSERT v_error LIKE '23514 %', 'sent ship-to authority still refuses a rewrite';

  -- Leave a row present so the negative RLS assertions cannot pass on emptiness.
  PERFORM public.add_project_destination_location(v_project, v_home);
  FOREACH v_actor IN ARRAY ARRAY[
    '85600000-0000-4000-8000-0000000000a4'::uuid,
    '85600000-0000-4000-8000-0000000000a3'::uuid
  ] LOOP
    PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_actor, 'role', 'authenticated')::text, true);
    ASSERT NOT EXISTS (SELECT 1 FROM public.project_destination_locations WHERE project_id = v_project),
      'non-member cannot read populated job places';
    ASSERT NOT EXISTS (SELECT 1 FROM public.studio_locations WHERE id = v_home),
      'private marker does not broaden studio access';
  END LOOP;
  ASSERT NOT has_function_privilege('anon', 'public.add_project_destination_location(uuid,uuid)', 'EXECUTE')
    AND NOT has_function_privilege('anon', 'public.remove_project_destination_location(uuid,uuid)', 'EXECUTE')
    AND NOT has_function_privilege('anon', 'public.set_project_ffe_planned_destination(uuid,uuid)', 'EXECUTE'),
    'anonymous destination RPC execution is denied';
  RAISE NOTICE 'PASS job_destinations_contract: authorization, private marker, job membership, planned intent, sent snapshot';
END;
$job_destinations_contract$;
ROLLBACK;
