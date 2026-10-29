\set ON_ERROR_STOP on
BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '30s';
\ir typed_subjects_body.psql
DO $$
DECLARE
  hidden_setup text;
  hidden_subject_setup text;
BEGIN
  hidden_setup := pg_temp.sql_of('UPDATE public.field_captures SET designer_id={D},project_id={PA},project_room_id={XA},title=''Withheld capture'' WHERE id={XB}');
  hidden_subject_setup := hidden_setup || '; ' || pg_temp.sql_of('UPDATE public.margin_notes SET subject_kind=''field_capture'',subject_id={XB} WHERE id={N4}');
  ASSERT pg_temp.probe(pg_temp.id('D'), pg_temp.sql_of('SELECT payload->>''capture_room_name'' FROM public.margin_items WHERE kind=''note'' AND item_id={N4}'), hidden_setup) = '874 A room', 'fixture room name resolves when visible';
  ASSERT pg_temp.probe(pg_temp.id('D'), pg_temp.sql_of('SELECT payload->>''capture_title'' FROM public.margin_items WHERE kind=''note'' AND item_id={N4}'), hidden_setup) = 'Withheld capture', 'fixture capture title resolves when visible';
  ASSERT pg_temp.probe(pg_temp.id('D'), pg_temp.sql_of('SELECT payload->>''capture_kind'' FROM public.margin_items WHERE kind=''note'' AND item_id={N4}'), hidden_setup) = 'specimen', 'fixture capture kind resolves when visible';
  ASSERT pg_temp.probe(pg_temp.id('D'), pg_temp.sql_of('SELECT (payload->>''capture_date'') IS NOT NULL FROM public.margin_items WHERE kind=''note'' AND item_id={N4}'), hidden_setup) = 'true', 'fixture capture date resolves when visible';
  ASSERT pg_temp.probe(pg_temp.id('D'), pg_temp.sql_of('SELECT payload->>''capture_room_name'' FROM public.margin_items WHERE kind=''note'' AND item_id={N1}'), NULL) = '874 A room', 'visible capture room label';
  ASSERT pg_temp.probe(pg_temp.id('A1'), pg_temp.sql_of('SELECT payload->>''capture_room_name'' FROM public.margin_items WHERE kind=''note'' AND item_id={N4}'), hidden_setup) = 'null', 'hidden capture room label withheld';
  ASSERT pg_temp.probe(pg_temp.id('A1'), pg_temp.sql_of('SELECT payload->>''capture_title'' FROM public.margin_items WHERE kind=''note'' AND item_id={N4}'), hidden_setup) = 'null', 'hidden capture title withheld';
  ASSERT pg_temp.probe(pg_temp.id('A1'), pg_temp.sql_of('SELECT payload->>''capture_kind'' FROM public.margin_items WHERE kind=''note'' AND item_id={N4}'), hidden_setup) = 'null', 'hidden capture kind withheld';
  ASSERT pg_temp.probe(pg_temp.id('A1'), pg_temp.sql_of('SELECT payload->>''capture_date'' FROM public.margin_items WHERE kind=''note'' AND item_id={N4}'), hidden_setup) = 'null', 'hidden capture date withheld';
  ASSERT pg_temp.probe(pg_temp.id('D'), pg_temp.sql_of('SELECT payload->>''subject_capture_title'' FROM public.margin_items WHERE kind=''note'' AND item_id={N4}'), hidden_subject_setup) = 'Withheld capture', 'fixture subject title resolves when visible';
  ASSERT pg_temp.probe(pg_temp.id('A1'), pg_temp.sql_of('SELECT payload->>''subject_capture_title'' FROM public.margin_items WHERE kind=''note'' AND item_id={N4}'), hidden_subject_setup) = 'null', 'hidden subject capture title withheld';
  ASSERT pg_temp.probe(pg_temp.id('A1'), pg_temp.sql_of('SELECT payload->>''subject_capture_kind'' FROM public.margin_items WHERE kind=''note'' AND item_id={N4}'), hidden_subject_setup) = 'null', 'hidden subject capture kind withheld';
  ASSERT pg_temp.probe(pg_temp.id('A1'), pg_temp.sql_of('SELECT payload->>''subject_capture_date'' FROM public.margin_items WHERE kind=''note'' AND item_id={N4}'), hidden_subject_setup) = 'null', 'hidden subject capture date withheld';
  ASSERT pg_temp.probe(pg_temp.id('D'), pg_temp.sql_of('SELECT payload->>''capture_kind'' FROM public.margin_items WHERE kind=''note'' AND item_id={N1}'), NULL) = 'specimen', 'visible capture kind';
  ASSERT pg_temp.probe(pg_temp.id('D'), pg_temp.sql_of('SELECT (payload->>''capture_date'') IS NOT NULL FROM public.margin_items WHERE kind=''note'' AND item_id={N1}'), NULL) = 'true', 'visible capture date';
  UPDATE public.margin_notes SET subject_kind = 'project_room', subject_id = pg_temp.id('XA') WHERE id = pg_temp.id('N1');
  ASSERT pg_temp.probe(pg_temp.id('D'), pg_temp.sql_of('SELECT payload->>''subject_room_name'' FROM public.margin_items WHERE kind=''note'' AND item_id={N1}'), NULL) = '874 A room', 'subject room label';
  UPDATE public.margin_notes SET subject_kind = 'plan_print' WHERE id = pg_temp.id('N1');
  ASSERT pg_temp.probe(pg_temp.id('D'), pg_temp.sql_of('SELECT payload->>''subject_print_label'' FROM public.margin_items WHERE kind=''note'' AND item_id={N1}'), NULL) = '874-A1 rev A · 874 plan', 'subject print label';
  UPDATE public.margin_notes SET subject_kind = 'plan_issue' WHERE id = pg_temp.id('N1');
  ASSERT pg_temp.probe(pg_temp.id('D'), pg_temp.sql_of('SELECT payload->>''subject_issue_label'' FROM public.margin_items WHERE kind=''note'' AND item_id={N1}'), NULL) = 'Issue 1 · 874 issue', 'subject issue label';
  UPDATE public.margin_notes SET subject_kind = 'field_capture' WHERE id = pg_temp.id('N1');
  ASSERT pg_temp.probe(pg_temp.id('D'), pg_temp.sql_of('SELECT payload->>''subject_capture_kind'' FROM public.margin_items WHERE kind=''note'' AND item_id={N1}'), NULL) = 'specimen', 'subject capture kind';
  UPDATE public.margin_notes SET subject_kind = 'ffe_item' WHERE id = pg_temp.id('N1');
  ASSERT pg_temp.probe(pg_temp.id('D'), pg_temp.sql_of('SELECT payload->>''subject_ffe_label'' FROM public.margin_items WHERE kind=''note'' AND item_id={N1}'), NULL) = '874 A item', 'subject FF&E label';
  UPDATE public.purchase_orders SET sidemark = 'Kitchen PO' WHERE id = pg_temp.id('XA');
  UPDATE public.margin_notes SET subject_kind = 'purchase_order' WHERE id = pg_temp.id('N1');
  ASSERT pg_temp.probe(pg_temp.id('D'), pg_temp.sql_of('SELECT payload->>''subject_order_label'' FROM public.margin_items WHERE kind=''note'' AND item_id={N1}'), NULL) = 'Kitchen PO', 'subject order label';
  UPDATE public.margin_notes SET subject_kind = 'coordination_item' WHERE id = pg_temp.id('N1');
  ASSERT pg_temp.probe(pg_temp.id('D'), pg_temp.sql_of('SELECT payload->>''subject_coordination_label'' FROM public.margin_items WHERE kind=''note'' AND item_id={N1}'), NULL) = '874 coordination', 'subject coordination label';
  INSERT INTO public.project_packages(id,project_id,package_kind,code,title,idempotency_key,request_hash)
    VALUES (pg_temp.id('DEC2'),pg_temp.id('PA'),'cabinetry','CAB-01','Kitchen cabinetry','00902-label','00902-label');
  UPDATE public.margin_notes SET subject_kind = 'project_package', subject_id = pg_temp.id('DEC2') WHERE id = pg_temp.id('N1');
  ASSERT pg_temp.probe(pg_temp.id('D'), pg_temp.sql_of('SELECT payload->>''subject_package_label'' FROM public.margin_items WHERE kind=''note'' AND item_id={N1}'), NULL) = 'CAB-01 · Kitchen cabinetry', 'subject package label';
END $$;
ROLLBACK;
