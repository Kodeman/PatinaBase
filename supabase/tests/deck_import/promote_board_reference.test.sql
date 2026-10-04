-- US-15 "Promote request": promote_board_reference_to_selection carries the
-- pin's name, product, disposition and source metadata into the FF&E line.
-- The p_request shapes below mirror usePromoteBoardReferenceToSelection +
-- promoteRequestFromPin (packages/supabase, packages/types).
BEGIN;
SET LOCAL statement_timeout='30s';

CREATE OR REPLACE FUNCTION pg_temp.assume_promote_actor(p_actor uuid)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',p_actor,'role','authenticated')::text,true);
  PERFORM set_config('request.jwt.claim.sub',p_actor::text,true);
  PERFORM set_config('request.jwt.claim.role','authenticated',true);
END; $$;

INSERT INTO auth.users(id,email,encrypted_password,email_confirmed_at,created_at,updated_at,instance_id,aud,role) VALUES
('d1500000-0000-4000-8000-000000000001','promote-owner@test.invalid','',now(),now(),now(),'00000000-0000-0000-0000-000000000000','authenticated','authenticated');
INSERT INTO public.profiles(id,email,full_name) VALUES
('d1500000-0000-4000-8000-000000000001','promote-owner@test.invalid','Promote Owner')
ON CONFLICT(id) DO UPDATE SET email=excluded.email;
INSERT INTO public.projects(id,name,designer_id,created_by) VALUES
('d1510000-0000-4000-8000-000000000001','Promote Project','d1500000-0000-4000-8000-000000000001','d1500000-0000-4000-8000-000000000001');
INSERT INTO public.vendors(id,name) VALUES('d1530000-0000-4000-8000-000000000001','Promote Vendor');
INSERT INTO public.products(id,name,price_retail,price_trade,images,vendor_id,captured_by,captured_at,layer,status) VALUES
('d1540000-0000-4000-8000-000000000001','Promote Sofa',250000,180000,ARRAY['https://example.invalid/sofa.jpg'],'d1530000-0000-4000-8000-000000000001','d1500000-0000-4000-8000-000000000001',now(),'catalog','published');

DO $$
DECLARE
  v_board uuid;
  v_loose_pin uuid := 'd1560000-0000-4000-8000-000000000001';
  v_product_pin uuid := 'd1560000-0000-4000-8000-000000000002';
  v_selected_pin uuid := 'd1560000-0000-4000-8000-000000000003';
  v_result jsonb;
  v_item public.project_ffe_items%ROWTYPE;
  v_routing jsonb;
BEGIN
  PERFORM pg_temp.assume_promote_actor('d1500000-0000-4000-8000-000000000001');
  v_board := (public.create_project_board(
    '{"projectId":"d1510000-0000-4000-8000-000000000001","name":"Deck import board"}'::jsonb
  )->>'boardId')::uuid;

  PERFORM set_config('app.board_state_rpc','on',true);
  INSERT INTO public.proposal_board_items(id,board_id,type,x,y,width,product_id,content,data) VALUES
  (v_loose_pin,v_board,'capture',0,0,240,NULL,'Slide 4 caption',
   '{"name":"Rattan lounge chair","source_url":"https://maker.invalid/rattan","price_cents":145000,"vendor_name":"Loose Maker"}'::jsonb),
  (v_product_pin,v_board,'product',260,0,240,'d1540000-0000-4000-8000-000000000001',NULL,
   '{"name":"Promote Sofa"}'::jsonb),
  (v_selected_pin,v_board,'capture',520,0,240,NULL,'Brass sconce','{}'::jsonb);
  PERFORM set_config('app.board_state_rpc','',true);

  -- (a) A pin with no product: the line takes the pin's name, and the source
  -- metadata lands on the selection spec's routing_source.
  v_result := public.promote_board_reference_to_selection(v_loose_pin, jsonb_build_object(
    'assignmentScope','unassigned','roomId',NULL,'disposition','candidate',
    'duplicateMode','reuse','idempotencyKey','promote:'||v_loose_pin,
    'name','Rattan lounge chair',
    'sourceMetadata',jsonb_build_object(
      'sourceUrl','https://maker.invalid/rattan','priceCents',145000,'vendorName','Loose Maker')
  ));
  ASSERT v_result->>'outcome'='created', 'loose pin promote must create a line, got '||v_result::text;
  SELECT * INTO v_item FROM public.project_ffe_items WHERE id=(v_result->>'selectionId')::uuid;
  ASSERT v_item.name='Rattan lounge chair', 'loose pin line must carry the pin name, got '||COALESCE(v_item.name,'<null>');
  ASSERT v_item.product_id IS NULL, 'loose pin line must stay product-less';
  ASSERT v_item.design_disposition='candidate', 'candidate disposition must be kept';
  SELECT routing_source INTO v_routing FROM public.project_ffe_specs WHERE ffe_item_id=v_item.id;
  ASSERT v_routing->>'sourceUrl'='https://maker.invalid/rattan', 'source URL must be retained in routing_source, got '||COALESCE(v_routing::text,'<null>');
  ASSERT (v_routing->>'priceCents')::integer=145000 AND v_routing->>'vendorName'='Loose Maker',
    'price and vendor name must be retained in routing_source, got '||COALESCE(v_routing::text,'<null>');
  ASSERT (SELECT project_ffe_item_id=v_item.id FROM public.proposal_board_items WHERE id=v_loose_pin),
    'the pin must link to its new selection';

  -- (b) A pin with a product: the line carries the product's vendor and price.
  v_result := public.promote_board_reference_to_selection(v_product_pin, jsonb_build_object(
    'assignmentScope','unassigned','roomId',NULL,'disposition','candidate',
    'duplicateMode','reuse','idempotencyKey','promote:'||v_product_pin,
    'name','Promote Sofa','productId','d1540000-0000-4000-8000-000000000001'
  ));
  SELECT * INTO v_item FROM public.project_ffe_items WHERE id=(v_result->>'selectionId')::uuid;
  ASSERT v_item.product_id='d1540000-0000-4000-8000-000000000001', 'product pin line must keep the product';
  ASSERT v_item.vendor_id='d1530000-0000-4000-8000-000000000001', 'product pin line must carry vendor_id';
  ASSERT v_item.vendor_name='Promote Vendor', 'product pin line must carry the vendor name, got '||COALESCE(v_item.vendor_name,'<null>');
  ASSERT v_item.unit_price_cents=250000 AND v_item.trade_price_cents=180000,
    'product pin line must carry the product price, got '||v_item.unit_price_cents||'/'||COALESCE(v_item.trade_price_cents::text,'<null>');

  -- (c) disposition='selected' is honoured.
  v_result := public.promote_board_reference_to_selection(v_selected_pin, jsonb_build_object(
    'assignmentScope','unassigned','roomId',NULL,'disposition','selected',
    'duplicateMode','reuse','idempotencyKey','promote:'||v_selected_pin,
    'name','Brass sconce'
  ));
  SELECT * INTO v_item FROM public.project_ffe_items WHERE id=(v_result->>'selectionId')::uuid;
  ASSERT v_item.design_disposition='selected', 'selected disposition must be honoured, got '||COALESCE(v_item.design_disposition,'<null>');
  ASSERT v_item.name='Brass sconce', 'content fallback name must be used';
END; $$;

ROLLBACK;
