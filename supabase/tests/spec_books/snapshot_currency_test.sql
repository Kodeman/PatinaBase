-- 00667: a Spec Book item snapshot carries its price's currency
-- (project_ffe_items.currency) at `pricing.currency`, the key spec-book-render
-- reads. On the 00403 body both assertions fail (the key is absent); with 00667
-- applied they pass. The file runs in one transaction and rolls back.
BEGIN;
SET LOCAL statement_timeout = '30s';

INSERT INTO auth.users(id,email,encrypted_password,email_confirmed_at,created_at,updated_at,instance_id,aud,role) VALUES
('5c000000-0000-4000-8000-000000000001','sbc-owner@test.invalid','',now(),now(),now(),'00000000-0000-0000-0000-000000000000','authenticated','authenticated');
INSERT INTO public.profiles(id,email,full_name) VALUES
('5c000000-0000-4000-8000-000000000001','sbc-owner@test.invalid','SBC Owner')
ON CONFLICT(id) DO NOTHING;
INSERT INTO public.projects(id,name,designer_id,created_by) VALUES
('5c000000-0000-4000-8000-000000000101','SBC Project','5c000000-0000-4000-8000-000000000001','5c000000-0000-4000-8000-000000000001');
INSERT INTO public.project_rooms(id,project_id,name,sort_order) VALUES
('5c000000-0000-4000-8000-000000000201','5c000000-0000-4000-8000-000000000101','Salon',0);

-- One EUR and one USD selection, both priced.
INSERT INTO public.project_ffe_items(
  id,project_id,project_room_id,assignment_scope,name,doc_code,status,quantity,sort_order,
  unit_price_cents,currency
) VALUES
('5c000000-0000-4000-8000-000000000501','5c000000-0000-4000-8000-000000000101',
 '5c000000-0000-4000-8000-000000000201','room','Paris Sconce','SA-01','specified',1,0,42000,'EUR'),
('5c000000-0000-4000-8000-000000000502','5c000000-0000-4000-8000-000000000101',
 '5c000000-0000-4000-8000-000000000201','room','Walnut Chair','SA-02','specified',1,1,125000,'USD');

DO $$
DECLARE
  v_book public.spec_books;
  v_eur jsonb;
  v_usd jsonb;
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub','5c000000-0000-4000-8000-000000000001','role','authenticated')::text, true);
  v_book := public.ensure_project_spec_book('5c000000-0000-4000-8000-000000000101');

  SELECT item_snapshot INTO v_eur FROM public._spec_book_current_item_snapshots(v_book.id)
  WHERE ffe_item_id = '5c000000-0000-4000-8000-000000000501';
  SELECT item_snapshot INTO v_usd FROM public._spec_book_current_item_snapshots(v_book.id)
  WHERE ffe_item_id = '5c000000-0000-4000-8000-000000000502';

  ASSERT v_eur IS NOT NULL AND v_usd IS NOT NULL,
    'both selections must be in the Spec Book snapshot';
  ASSERT v_eur #>> '{pricing,currency}' = 'EUR',
    format('a EUR item''s snapshot must carry EUR; got %s', v_eur -> 'pricing');
  ASSERT (v_eur #>> '{pricing,clientPriceCents}')::integer = 42000,
    'the EUR snapshot keeps its client price';
  ASSERT v_usd #>> '{pricing,currency}' = 'USD',
    format('a USD item''s snapshot must carry USD; got %s', v_usd -> 'pricing');
END;
$$;

\echo 'snapshot_currency_test: EUR and USD snapshots carry their currency'
ROLLBACK;
