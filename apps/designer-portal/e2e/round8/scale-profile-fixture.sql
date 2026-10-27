-- SQ-1975: fictional scale jobs only; F01's actor is borrowed, never deleted.
-- Setup/cleanup share the ownership checks. Caller sets patina.scale_cleanup=on
-- for cleanup, and must hold the Wave-2 browser slot for either operation.
BEGIN;
SET LOCAL statement_timeout = '120s';
DO $$
DECLARE
  actor constant uuid := 'f0180000-0000-4000-8000-000000000002';
  studio constant uuid := 'f0180000-0000-4000-8000-000000000001';
  job uuid;
  room uuid;
  size integer;
  r integer;
  b integer;
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.projects
    WHERE id::text LIKE 'e6591000-%'
      AND (id NOT IN ('e6591000-0000-4000-8000-000000000500', 'e6591000-0000-4000-8000-000000002000')
        OR designer_id IS DISTINCT FROM actor OR studio_id IS DISTINCT FROM studio
        OR name IS DISTINCT FROM 'SQ-1975 Fictional scale ' || CASE WHEN id::text LIKE '%000500' THEN '500' ELSE '2000' END
        OR notes IS DISTINCT FROM 'SQ-1975 disposable local scale fixture')
  ) OR EXISTS (
    SELECT 1 FROM public.project_rooms WHERE project_id::text LIKE 'e6591000-%'
      AND name NOT LIKE 'SQ-1975 Room %'
  ) OR EXISTS (
    SELECT 1 FROM public.project_ffe_items WHERE project_id::text LIKE 'e6591000-%'
      AND (name NOT LIKE 'SQ-1975 Line %' OR product_id IS NOT NULL)
  ) THEN
    RAISE EXCEPTION 'Refusing non-fixture scale rows';
  END IF;
  DELETE FROM public.project_ffe_command_idempotency WHERE actor_id=actor AND idempotency_key LIKE 'sq1975-%';
  DELETE FROM public.projects WHERE id IN (
    'e6591000-0000-4000-8000-000000000500', 'e6591000-0000-4000-8000-000000002000');
  IF current_setting('patina.scale_cleanup', true) = 'on' THEN RETURN; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.organization_members
    WHERE user_id=actor AND organization_id=studio AND role='owner' AND status='active') THEN
    RAISE EXCEPTION 'F01 fictional owner required';
  END IF;
  FOREACH size IN ARRAY ARRAY[500,2000] LOOP
    job := ('e6591000-0000-4000-8000-' || lpad(size::text,12,'0'))::uuid;
    INSERT INTO public.projects(id,name,status,created_by,designer_id,studio_id,notes)
      VALUES(job,'SQ-1975 Fictional scale '||size,'active',actor,actor,studio,'SQ-1975 disposable local scale fixture');
    FOR r IN 1..10 LOOP
      room := gen_random_uuid();
      INSERT INTO public.project_rooms(id,project_id,name,sort_order)
        VALUES(room,job,'SQ-1975 Room '||lpad(r::text,2,'0'),r);
      PERFORM set_config('request.jwt.claims',json_build_object('sub',actor,'role','authenticated')::text,true);
      FOR b IN 0..(size/10-1)/100 LOOP
        PERFORM public.batch_create_named_project_needs(jsonb_build_object(
          'projectId',job,'roomId',room,'assignmentScope','room',
          'idempotencyKey','sq1975-'||job||'-'||r||'-'||b,
          'lines',(SELECT jsonb_agg(jsonb_build_object(
            'name','SQ-1975 Line '||lpad(((r-1)*(size/10)+n)::text,4,'0'),
            'quantity',1,'unit','each','roughCents',10000) ORDER BY n)
            FROM generate_series(b*100+1,least((b+1)*100,size/10)) n)));
      END LOOP;
    END LOOP;
  END LOOP;
END $$;
COMMIT;
