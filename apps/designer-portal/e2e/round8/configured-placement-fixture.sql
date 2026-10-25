-- C04 fictional local fixture. F01 owns the authenticated actor and studio.
BEGIN;
DO $$ BEGIN
  ASSERT NOT EXISTS (SELECT 1 FROM public.projects WHERE id='f1985000-0000-4000-8000-000000000010'), 'C04 project must start absent';
  ASSERT NOT EXISTS (SELECT 1 FROM public.products WHERE id='f1985000-0000-4000-8000-000000000020'), 'C04 product must start absent';
END $$;
INSERT INTO public.projects(id,name,status,created_by,designer_id,studio_id)
VALUES ('f1985000-0000-4000-8000-000000000010','C04 Fictional Configuration House','active',
'f0180000-0000-4000-8000-000000000002','f0180000-0000-4000-8000-000000000002','f0180000-0000-4000-8000-000000000001');
INSERT INTO public.project_rooms(id,project_id,name,sort_order)
VALUES ('f1985000-0000-4000-8000-000000000011','f1985000-0000-4000-8000-000000000010','C04 Sitting Room',0);
INSERT INTO public.products(id,name,source_url,layer,owner_user_id,captured_by,captured_at,status,price_retail,price_trade)
VALUES ('f1985000-0000-4000-8000-000000000020','C04 Fictional Material Chair','https://example.invalid/c04-chair','personal',
'f0180000-0000-4000-8000-000000000002','f0180000-0000-4000-8000-000000000002',now(),'published',320000,210000);
SELECT set_config('request.jwt.claims','{"sub":"f0180000-0000-4000-8000-000000000002","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
SELECT public.batch_create_named_project_needs('{"projectId":"f1985000-0000-4000-8000-000000000010","roomId":"f1985000-0000-4000-8000-000000000011","assignmentScope":"room","idempotencyKey":"c04-initial-need","lines":[{"name":"C04 existing need","quantity":1,"unit":"each"}]}'::jsonb);
SELECT public.upsert_product_configuration_schema('f1985000-0000-4000-8000-000000000020',
'{"mode":"variant","pricingStrategy":"base_plus_adjustments","optionGroups":[{"code":"material","name":"Material","selectionType":"single","required":true,"minSelections":1,"maxSelections":1,"position":0,"values":[{"code":"walnut","label":"Walnut","position":0},{"code":"oak","label":"Oak","position":1}]}],"variants":[{"code":"walnut","name":"Walnut","status":"active","isDefault":true,"retailPriceCents":320000,"tradePriceCents":210000,"leadTimeWeeks":8,"optionValueCodes":["material:walnut"]},{"code":"oak","name":"Oak","status":"active","retailPriceCents":305000,"tradePriceCents":201000,"leadTimeWeeks":8,"optionValueCodes":["material:oak"]}]}'::jsonb,NULL);
COMMIT;
