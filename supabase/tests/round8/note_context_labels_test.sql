\set ON_ERROR_STOP on
BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '30s';
\ir typed_subjects_body.psql
DO $$
BEGIN
  ASSERT pg_temp.probe(pg_temp.id('D'), pg_temp.sql_of('SELECT payload->>''capture_room_name'' FROM public.margin_items WHERE kind=''note'' AND item_id={N1}'), NULL) = '874 A room', 'visible capture room label';
  ASSERT pg_temp.probe(pg_temp.id('A1'), pg_temp.sql_of('SELECT payload->>''capture_room_name'' FROM public.margin_items WHERE kind=''note'' AND item_id={N4}'), NULL) = 'null', 'hidden capture room label withheld';
  ASSERT pg_temp.probe(pg_temp.id('A1'), pg_temp.sql_of('SELECT payload->>''capture_title'' FROM public.margin_items WHERE kind=''note'' AND item_id={N4}'), NULL) = 'null', 'hidden capture title withheld';
  ASSERT pg_temp.probe(pg_temp.id('D'), pg_temp.sql_of('SELECT payload->>''capture_kind'' FROM public.margin_items WHERE kind=''note'' AND item_id={N1}'), NULL) = 'specimen', 'visible capture kind';
  ASSERT pg_temp.probe(pg_temp.id('D'), pg_temp.sql_of('SELECT (payload->>''capture_date'') IS NOT NULL FROM public.margin_items WHERE kind=''note'' AND item_id={N1}'), NULL) = 'true', 'visible capture date';
  UPDATE public.margin_notes SET subject_kind = 'project_room', subject_id = pg_temp.id('XA') WHERE id = pg_temp.id('N1');
  ASSERT pg_temp.probe(pg_temp.id('D'), pg_temp.sql_of('SELECT payload->>''subject_room_name'' FROM public.margin_items WHERE kind=''note'' AND item_id={N1}'), NULL) = '874 A room', 'subject room label';
  UPDATE public.margin_notes SET subject_kind = 'plan_print' WHERE id = pg_temp.id('N1');
  ASSERT pg_temp.probe(pg_temp.id('D'), pg_temp.sql_of('SELECT payload->>''subject_print_label'' FROM public.margin_items WHERE kind=''note'' AND item_id={N1}'), NULL) = '874-A1 · 874 plan', 'subject print label';
  UPDATE public.margin_notes SET subject_kind = 'plan_issue' WHERE id = pg_temp.id('N1');
  ASSERT pg_temp.probe(pg_temp.id('D'), pg_temp.sql_of('SELECT payload->>''subject_issue_label'' FROM public.margin_items WHERE kind=''note'' AND item_id={N1}'), NULL) = 'Issue 1 · 874 issue', 'subject issue label';
  UPDATE public.margin_notes SET subject_kind = 'field_capture' WHERE id = pg_temp.id('N1');
  ASSERT pg_temp.probe(pg_temp.id('D'), pg_temp.sql_of('SELECT payload->>''subject_capture_kind'' FROM public.margin_items WHERE kind=''note'' AND item_id={N1}'), NULL) = 'specimen', 'subject capture kind';
END $$;
ROLLBACK;
