-- 00856 / SQ-1769: job destinations contract. Real authenticated RPC path.
-- Every fixture and assertion is rolled back; never resets the shared DB.
BEGIN;
SET LOCAL statement_timeout = '45s';
SET LOCAL lock_timeout = '5s';

INSERT INTO auth.users(id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
SELECT id, 'sq1780-' || id || '@test.invalid', '', now(), now(), now(),
  '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'
FROM unnest(ARRAY[
  '85900000-0000-4000-8000-0000000000a1'::uuid,
  '85900000-0000-4000-8000-0000000000a2'::uuid,
  '85900000-0000-4000-8000-0000000000a3'::uuid,
  '85900000-0000-4000-8000-0000000000a4'::uuid
]) AS id;
INSERT INTO public.profiles(id, email, full_name)
SELECT id, email, 'SQ1780 designer' FROM auth.users WHERE email LIKE 'sq1780-%@test.invalid'
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.organizations(id, type, name, slug) VALUES
  ('85900000-0000-4000-8000-0000000000f1', 'design_studio', 'SQ1780 studio A', 'sq1780-studio-a'),
  ('85900000-0000-4000-8000-0000000000f2', 'design_studio', 'SQ1780 studio B', 'sq1780-studio-b');
INSERT INTO public.organization_members(user_id, organization_id, role, status) VALUES
  ('85900000-0000-4000-8000-0000000000a1', '85900000-0000-4000-8000-0000000000f1', 'owner', 'active'),
  ('85900000-0000-4000-8000-0000000000a2', '85900000-0000-4000-8000-0000000000f1', 'member', 'active'),
  ('85900000-0000-4000-8000-0000000000a3', '85900000-0000-4000-8000-0000000000f1', 'guest', 'active'),
  ('85900000-0000-4000-8000-0000000000a4', '85900000-0000-4000-8000-0000000000f2', 'owner', 'active');
INSERT INTO public.projects(id, name, designer_id, created_by, studio_id) VALUES
  ('85900000-0000-4000-8000-000000000001', 'SQ1780 job A', '85900000-0000-4000-8000-0000000000a1', '85900000-0000-4000-8000-0000000000a1', '85900000-0000-4000-8000-0000000000f1'),
  ('85900000-0000-4000-8000-000000000002', 'SQ1780 other job A', '85900000-0000-4000-8000-0000000000a1', '85900000-0000-4000-8000-0000000000a1', '85900000-0000-4000-8000-0000000000f1');
INSERT INTO public.studio_locations(id, organization_id, kind, label) VALUES
  ('85900000-0000-4000-8000-000000000011', '85900000-0000-4000-8000-0000000000f1', 'receiver', 'Original dock'),
  ('85900000-0000-4000-8000-000000000012', '85900000-0000-4000-8000-0000000000f1', 'site', 'Home'),
  ('85900000-0000-4000-8000-000000000013', '85900000-0000-4000-8000-0000000000f2', 'receiver', 'Other studio'),
  ('85900000-0000-4000-8000-000000000014', '85900000-0000-4000-8000-0000000000f1', 'storage', 'Unchosen');
INSERT INTO public.vendors(id, name) VALUES ('85900000-0000-4000-8000-000000000021', 'SQ1780 vendor');
INSERT INTO public.purchase_orders(id, designer_id, project_id, vendor_id, payment_pattern, status, sent_at, ship_to, ship_to_location_id)
VALUES ('85900000-0000-4000-8000-000000000101', '85900000-0000-4000-8000-0000000000a1',
  '85900000-0000-4000-8000-000000000001', '85900000-0000-4000-8000-000000000021', 'net_30',
  'draft', NULL, 'Original dock\n1 Original Street', '85900000-0000-4000-8000-000000000011');

INSERT INTO public.studio_contacts(id, organization_id, entity_kind, contact_kind, company_name)
VALUES ('85900000-0000-4000-8000-000000000301', '85900000-0000-4000-8000-0000000000f1', 'company', 'receiver', 'Badger Freight');
UPDATE public.studio_locations SET label = 'Receiving dock', address = '{"street":"7 Dock Rd","city":"Madison","state":"WI","zip":"53704"}', studio_contact_id = '85900000-0000-4000-8000-000000000301', receiving_hours = 'Mon–Fri 8–4', instructions = E'Call ahead.\nUse rear door.' WHERE id = '85900000-0000-4000-8000-000000000011';
UPDATE public.studio_locations SET address = '{"street":"42 Lake Rd","city":"Middleton","state":"WI","zip":"53562"}' WHERE id = '85900000-0000-4000-8000-000000000012';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"85900000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
DO $snapshot_contract$
DECLARE
  v_po public.purchase_orders;
  v_id uuid := '85900000-0000-4000-8000-000000000101';
BEGIN
  v_po := public.set_purchase_order_ship_to_location(v_id, '85900000-0000-4000-8000-000000000011');
  ASSERT v_po.ship_to = E'Receiving dock\n7 Dock Rd\nMadison, WI 53704\nBadger Freight\nMon–Fri 8–4\nCall ahead.\nUse rear door.', 'snapshot includes receiving company, hours and instructions';
  v_po := public.set_purchase_order_ship_to_location(v_id, '85900000-0000-4000-8000-000000000012');
  ASSERT v_po.ship_to = E'Home\n42 Lake Rd\nMiddleton, WI 53562', 'absent receiving facts retain the exact legacy snapshot';
END $snapshot_contract$;
RESET ROLE;
UPDATE public.purchase_orders SET sent_at = now() WHERE id = '85900000-0000-4000-8000-000000000101';
SET LOCAL ROLE authenticated;
DO $sent_contract$
BEGIN
  BEGIN
    PERFORM public.set_purchase_order_ship_to_location('85900000-0000-4000-8000-000000000101', '85900000-0000-4000-8000-000000000011');
    RAISE EXCEPTION 'sent snapshot must remain fixed';
  EXCEPTION WHEN check_violation THEN
    ASSERT SQLERRM LIKE '%already sent%', 'sent PO remains refused by the sent-paper rule';
  END;
END $sent_contract$;
SELECT 'PASS ship_to_snapshot_receiver_contract';
ROLLBACK;
