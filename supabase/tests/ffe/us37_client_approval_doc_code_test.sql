-- SQ-1181: future review editions freeze docCode; historical snapshots stay put.
BEGIN;
SET LOCAL statement_timeout = '30s';
SELECT plan(18);

INSERT INTO auth.users(id,email,encrypted_password,email_confirmed_at,created_at,updated_at,instance_id,aud,role) VALUES
('83110000-0000-4000-8000-000000000001','label-designer@test.invalid','',now(),now(),now(),'00000000-0000-0000-0000-000000000000','authenticated','authenticated'),
('83110000-0000-4000-8000-000000000002','label-client@test.invalid','',now(),now(),now(),'00000000-0000-0000-0000-000000000000','authenticated','authenticated');
INSERT INTO public.profiles(id,email,full_name) VALUES
('83110000-0000-4000-8000-000000000001','label-designer@test.invalid','Label Designer'),
('83110000-0000-4000-8000-000000000002','label-client@test.invalid','Label Client')
ON CONFLICT(id) DO NOTHING;
INSERT INTO public.organizations(id,name,slug,type,status) VALUES
('83110000-0000-4000-8000-000000000003','Label Studio','sq1181-label-studio','design_studio','active');
INSERT INTO public.organization_members(user_id,organization_id,role,status) VALUES
('83110000-0000-4000-8000-000000000001','83110000-0000-4000-8000-000000000003','owner','active');
INSERT INTO public.user_roles(user_id,role_id,granted_by)
SELECT '83110000-0000-4000-8000-000000000001',id,'83110000-0000-4000-8000-000000000001'
FROM public.roles WHERE name='studio_owner';
INSERT INTO public.projects(id,name,designer_id,client_id,created_by,studio_id,status) VALUES
('83110000-0000-4000-8000-000000000004','Label House','83110000-0000-4000-8000-000000000001','83110000-0000-4000-8000-000000000002','83110000-0000-4000-8000-000000000001','83110000-0000-4000-8000-000000000003','active');
INSERT INTO public.products(id,name,price_retail,price_trade,captured_by,captured_at,layer,status) VALUES
('83110000-0000-4000-8000-000000000005','Label Chair',2400,1500,'83110000-0000-4000-8000-000000000001',now(),'catalog','published');

SELECT set_config('request.jwt.claim.sub','83110000-0000-4000-8000-000000000001',true);
SELECT set_config('request.jwt.claims','{"sub":"83110000-0000-4000-8000-000000000001","role":"authenticated"}',true);
CREATE TEMP TABLE label_review_state AS
SELECT (public.place_product_in_project_v2(jsonb_build_object(
  'projectId','83110000-0000-4000-8000-000000000004',
  'productId','83110000-0000-4000-8000-000000000005',
  'assignmentScope','throughout','disposition','selected',
  'duplicateMode','create','idempotencyKey','sq1181-selection'
))->>'selectionId')::uuid AS selection_id,
NULL::uuid AS future_id, NULL::uuid AS newest_id, NULL::jsonb AS bundle, NULL::integer AS expected_price;
UPDATE label_review_state state SET expected_price=item.unit_price_cents
FROM public.project_ffe_items item WHERE item.id=state.selection_id;
GRANT SELECT, UPDATE ON label_review_state TO authenticated;
SELECT public.set_project_ffe_item_label(selection_id,'LR-01') FROM label_review_state;

-- A pre-label edition fixture, constructed as a draft then published through
-- the existing guards. No historical published row is updated to add a label.
INSERT INTO public.project_review_editions(id,project_id,edition_number,title,created_by) VALUES
('83110000-0000-4000-8000-000000000006','83110000-0000-4000-8000-000000000004',1,'Historical review','83110000-0000-4000-8000-000000000001');
INSERT INTO public.project_review_items(
  edition_id,source_ffe_item_id,selection_thread_id,product_id,item_snapshot,content_hash
)
SELECT '83110000-0000-4000-8000-000000000006',item.id,item.selection_thread_id,item.product_id,
  jsonb_build_object('selectionId',item.id,'name',item.name,'quantity',item.quantity,'media','[]'::jsonb),repeat('0',64)
FROM public.project_ffe_items item JOIN label_review_state state ON state.selection_id=item.id;
SELECT set_config('app.project_review_publish','on',true);
UPDATE public.project_review_editions edition
SET status='published',published_at=now(),published_by='83110000-0000-4000-8000-000000000001',
  snapshot_hash=encode(extensions.digest(jsonb_build_object(
    'editionId',edition.id,'rooms',edition.room_snapshot,'boards',edition.board_snapshot,
    'items',(SELECT jsonb_agg(jsonb_build_object('id',id,'hash',content_hash) ORDER BY sort_order,id)
      FROM public.project_review_items WHERE edition_id=edition.id)
  )::text,'sha256'),'hex')
WHERE id='83110000-0000-4000-8000-000000000006';
SELECT set_config('app.project_review_publish','',true);
INSERT INTO public.project_review_access(edition_id,actor_id) VALUES
('83110000-0000-4000-8000-000000000006','83110000-0000-4000-8000-000000000002');
CREATE TEMP TABLE historical_label_snapshot AS
SELECT item.item_snapshot,item.content_hash,edition.snapshot_hash
FROM public.project_review_items item JOIN public.project_review_editions edition ON edition.id=item.edition_id
WHERE edition.id='83110000-0000-4000-8000-000000000006';

SET LOCAL ROLE authenticated;
UPDATE label_review_state SET future_id=(public.publish_project_review(jsonb_build_object(
  'projectId','83110000-0000-4000-8000-000000000004','clientPriceMode','unit',
  'items',jsonb_build_array(jsonb_build_object('selectionId',selection_id,'docCode','SPOOF-99'))
))->>'editionId')::uuid;
RESET ROLE;
SELECT is((SELECT item_snapshot->>'docCode' FROM public.project_review_items WHERE edition_id=state.future_id),
  'LR-01','future edition freezes the job label, not the request label') FROM label_review_state state;
SELECT is((SELECT content_hash FROM public.project_review_items WHERE edition_id=state.future_id),
  (SELECT encode(extensions.digest(item_snapshot::text,'sha256'),'hex') FROM public.project_review_items WHERE edition_id=state.future_id),
  'item content hash includes the frozen label') FROM label_review_state state;
SELECT is(edition.snapshot_hash,encode(extensions.digest(jsonb_build_object(
  'editionId',edition.id,'rooms',edition.room_snapshot,'boards',edition.board_snapshot,
  'items',(SELECT jsonb_agg(jsonb_build_object('id',id,'hash',content_hash) ORDER BY sort_order,id)
    FROM public.project_review_items WHERE edition_id=edition.id)
)::text,'sha256'),'hex'),'edition hash includes the labeled item hash')
FROM public.project_review_editions edition JOIN label_review_state state ON edition.id=state.future_id;

SET LOCAL ROLE authenticated;
SELECT public.set_project_ffe_item_label(selection_id,'LR-02') FROM label_review_state;
RESET ROLE;
SELECT is((SELECT item_snapshot->>'docCode' FROM public.project_review_items WHERE edition_id=state.future_id),
  'LR-01','a live relabel never changes the published label') FROM label_review_state state;
SET LOCAL ROLE authenticated;
UPDATE label_review_state SET newest_id=(public.publish_project_review(jsonb_build_object(
  'projectId','83110000-0000-4000-8000-000000000004','clientPriceMode','hide',
  'items',jsonb_build_array(jsonb_build_object('selectionId',selection_id))
))->>'editionId')::uuid;
RESET ROLE;
SELECT is((SELECT item_snapshot->>'docCode' FROM public.project_review_items WHERE edition_id=state.newest_id),
  'LR-02','a later edition freezes the new label') FROM label_review_state state;
SELECT ok(NOT (item_snapshot ?| ARRAY['clientUnitPriceCents','clientLineTotalCents']),
  'hidden-price edition still omits both client price fields')
FROM public.project_review_items item JOIN label_review_state state ON item.edition_id=state.newest_id;
SELECT ok(item.item_snapshot=old.item_snapshot AND item.content_hash=old.content_hash AND edition.snapshot_hash=old.snapshot_hash,
  'historical edition snapshot and both hashes remain byte-identical')
FROM public.project_review_items item JOIN public.project_review_editions edition ON edition.id=item.edition_id
CROSS JOIN historical_label_snapshot old WHERE edition.id='83110000-0000-4000-8000-000000000006';
SELECT throws_ok(format('UPDATE public.project_review_items SET item_snapshot=item_snapshot || ''{"docCode":"TAMPER"}''::jsonb WHERE edition_id=%L',future_id),
  '23514',NULL,'published item labels remain immutable') FROM label_review_state;
SELECT ok(NOT has_function_privilege('authenticated','public._publish_project_review_00446_impl(jsonb)','EXECUTE'),
  'snapshot core remains private to the authority wrappers');
SELECT ok(NOT has_function_privilege('anon','public.publish_project_review(jsonb)','EXECUTE'),
  'anonymous publication remains denied');

SELECT set_config('request.jwt.claim.sub','83110000-0000-4000-8000-000000000002',true);
SELECT set_config('request.jwt.claims','{"sub":"83110000-0000-4000-8000-000000000002","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
UPDATE label_review_state SET bundle=public.get_client_project_review_bundle(future_id);
SELECT is(bundle#>>'{items,0,snapshot,docCode}','LR-01','client reads the frozen label, not the live label') FROM label_review_state;
SELECT is(bundle#>>'{items,0,snapshot,clientUnitPriceCents}',expected_price::text,
  'client unit price remains the published client price') FROM label_review_state;
SELECT ok((bundle#>'{items,0,snapshot}') ? 'clientUnitPriceCents',
  'unit-price edition retains its client-price field') FROM label_review_state;
SELECT ok(NOT EXISTS(SELECT 1 FROM jsonb_object_keys(bundle#>'{items,0,snapshot}') key
  WHERE key NOT IN ('selectionId','threadId','productId','name','docCode','category','quantity','assignmentScope','room','clientFields','media','clientUnitPriceCents')),
  'client snapshot keeps its explicit public-only key set') FROM label_review_state;
SELECT ok(bundle::text !~* 'retail|trade.?price|cost|markup|margin',
  'client bundle contains no private pricing') FROM label_review_state;
UPDATE label_review_state SET bundle=public.get_client_project_review_bundle('83110000-0000-4000-8000-000000000006');
SELECT ok(NOT ((bundle#>'{items,0,snapshot}') ? 'docCode'),
  'historical client edition still has no label key') FROM label_review_state;
SELECT throws_ok(format('SELECT public.publish_project_review(%L::jsonb)',jsonb_build_object(
  'projectId','83110000-0000-4000-8000-000000000004','items',jsonb_build_array(jsonb_build_object('selectionId',selection_id)))),
  '42501',NULL,'client cannot publish a labeled review') FROM label_review_state;
RESET ROLE;
SELECT is((SELECT status FROM public.project_ffe_items WHERE id=selection_id),'specified',
  'publication does not authorize a purchase') FROM label_review_state;

SELECT * FROM finish();
ROLLBACK;
