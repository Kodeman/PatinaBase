\pset pager off
BEGIN;
INSERT INTO public.project_parties (id, project_id, party_kind, display_name, stage, on_site_to, warranty_until, created_by) VALUES
 ('eeee0000-0000-4000-8000-000000000001','d0e00000-0000-0000-0000-00000000000a','sub','A live window',        'active', CURRENT_DATE+40, NULL,             'a0000000-0000-0000-0000-000000000004'),
 ('eeee0000-0000-4000-8000-000000000002','d0e00000-0000-0000-0000-00000000000a','sub','Window + warranty',    'active', CURRENT_DATE+40, CURRENT_DATE+400, 'a0000000-0000-0000-0000-000000000004'),
 ('eeee0000-0000-4000-8000-000000000003','d0e00000-0000-0000-0000-00000000000a','sub','Closed window',        'active', CURRENT_DATE-40, NULL,             'a0000000-0000-0000-0000-000000000004'),
 ('eeee0000-0000-4000-8000-000000000004','d0e00000-0000-0000-0000-00000000000a','sub','No window at all',     'active', NULL,            NULL,             'a0000000-0000-0000-0000-000000000004'),
 ('eeee0000-0000-4000-8000-000000000005','d0e00000-0000-0000-0000-00000000000a','sub','Warranty only',        'active', NULL,            CURRENT_DATE+200, 'a0000000-0000-0000-0000-000000000004'),
 ('eeee0000-0000-4000-8000-000000000006','d0e00000-0000-0000-0000-00000000000a','sub','Off the job',          'off_job',CURRENT_DATE-5,  NULL,             'a0000000-0000-0000-0000-000000000004');
DO $$
DECLARE r record; legs text[][] := ARRAY[
  ARRAY['A live window + caller date 5d out','eeee0000-0000-4000-8000-000000000001','5'],
  ARRAY['B window + warranty (later of two)','eeee0000-0000-4000-8000-000000000002',''],
  ARRAY['C closed window','eeee0000-0000-4000-8000-000000000003',''],
  ARRAY['D no window + caller date 7d','eeee0000-0000-4000-8000-000000000004','7'],
  ARRAY['E no window, no caller date','eeee0000-0000-4000-8000-000000000004',''],
  ARRAY['F warranty only','eeee0000-0000-4000-8000-000000000005',''],
  ARRAY['G off_job seat','eeee0000-0000-4000-8000-000000000006','']];
  i int; v_id uuid; v_exp date;
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"a0000000-0000-0000-0000-000000000004","role":"authenticated"}', true);
  FOR i IN 1..array_length(legs,1) LOOP
    IF legs[i][3] = '' THEN
      SELECT id INTO v_id FROM public.create_field_link(legs[i][2]::uuid);
    ELSE
      SELECT id INTO v_id FROM public.create_field_link(legs[i][2]::uuid, now() + (legs[i][3] || ' days')::interval);
    END IF;
    SELECT f.expires_at::date INTO v_exp FROM public.field_link_tokens f WHERE f.id = v_id;
    RAISE NOTICE '% -> % (today+%)', rpad(legs[i][1],38), v_exp, v_exp - CURRENT_DATE;
  END LOOP;
END $$;
ROLLBACK;
