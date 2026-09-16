\pset pager off
BEGIN;
SET LOCAL role authenticated;
SET LOCAL request.jwt.claims TO '{"sub":"a0000000-0000-0000-0000-000000000004","role":"authenticated"}';
DO $$
DECLARE v_seat uuid; v_id uuid; v_exp timestamptz; v_to date; v_w date;
BEGIN
  SELECT id, on_site_to, warranty_until INTO v_seat, v_to, v_w
    FROM public.project_parties
   WHERE display_name='Erin Sato' AND project_id='d0e00000-0000-0000-0000-00000000000a';
  SELECT id INTO v_id FROM public.create_field_link(v_seat, now() + interval '3 days');
  SELECT expires_at INTO v_exp FROM public.field_link_tokens WHERE id=v_id;
  RAISE NOTICE 'MINOR-1  live window %, warranty %, caller asked %, minted % -> caller honoured: %',
    v_to, v_w, (now()+interval '3 days')::date, v_exp::date, (v_exp::date = (now()+interval '3 days')::date);

  -- off the job: window closed 40 days ago
  UPDATE public.project_parties
     SET stage='off_job', off_job_at=CURRENT_DATE, on_site_from=CURRENT_DATE-80,
         on_site_to=CURRENT_DATE-40, warranty_until=NULL
   WHERE id=v_seat;
  SELECT id INTO v_id FROM public.create_field_link(v_seat);
  SELECT expires_at INTO v_exp FROM public.field_link_tokens WHERE id=v_id;
  RAISE NOTICE 'MINOR-20 off_job seat, window closed 40d ago: minted % (= 90 days: %)',
    v_exp::date, (v_exp::date = (now()+interval '90 days')::date);
END $$;
ROLLBACK;

\echo '--- MINOR-14: same seat, two session timezones ---'
BEGIN;
SET LOCAL role authenticated;
SET LOCAL request.jwt.claims TO '{"sub":"a0000000-0000-0000-0000-000000000004","role":"authenticated"}';
SET LOCAL timezone TO 'UTC';
DO $$ DECLARE v_id uuid; v_exp timestamptz; BEGIN
  SELECT id INTO v_id FROM public.create_field_link(
    (SELECT id FROM public.project_parties WHERE display_name='Ngozi Eze'
      AND project_id='d0e00000-0000-0000-0000-00000000000a' LIMIT 1));
  SELECT expires_at INTO v_exp FROM public.field_link_tokens WHERE id=v_id;
  RAISE NOTICE 'UTC session -> expires_at % (window end %)', v_exp,
    (SELECT greatest(on_site_to, coalesce(warranty_until,on_site_to)) FROM public.project_parties
      WHERE display_name='Ngozi Eze' AND project_id='d0e00000-0000-0000-0000-00000000000a' LIMIT 1);
END $$;
ROLLBACK;
BEGIN;
SET LOCAL role authenticated;
SET LOCAL request.jwt.claims TO '{"sub":"a0000000-0000-0000-0000-000000000004","role":"authenticated"}';
SET LOCAL timezone TO 'America/Chicago';
DO $$ DECLARE v_id uuid; v_exp timestamptz; BEGIN
  SELECT id INTO v_id FROM public.create_field_link(
    (SELECT id FROM public.project_parties WHERE display_name='Ngozi Eze'
      AND project_id='d0e00000-0000-0000-0000-00000000000a' LIMIT 1));
  SELECT expires_at INTO v_exp FROM public.field_link_tokens WHERE id=v_id;
  RAISE NOTICE 'Chicago session -> expires_at %', v_exp;
END $$;
ROLLBACK;
