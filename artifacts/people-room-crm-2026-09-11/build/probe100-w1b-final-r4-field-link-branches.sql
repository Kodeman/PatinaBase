\set ON_ERROR_STOP on
BEGIN;
SET LOCAL role authenticated;
SELECT set_config('request.jwt.claims','{"sub":"a0000000-0000-0000-0000-000000000004","role":"authenticated"}', true);
DO $$
DECLARE v_seat uuid; v_new uuid; v_exp timestamptz; v_win date; v_war date;
BEGIN
  SELECT pp.id, pp.on_site_to, pp.warranty_until INTO v_seat, v_win, v_war
    FROM public.project_parties pp JOIN public.projects pj ON pj.id=pp.project_id
   WHERE pj.designer_id='a0000000-0000-0000-0000-000000000004' AND pp.on_site_to > CURRENT_DATE LIMIT 1;
  SELECT l.id INTO v_new FROM public.create_field_link(v_seat, now()+interval '5 days') l;
  SELECT f.expires_at INTO v_exp FROM public.field_link_tokens f WHERE f.id=v_new;
  RAISE NOTICE 'A live window (%) + a caller date 5d out -> % (caller date NOT honoured: %)',
    v_win, v_exp::date, v_exp::date <> (now()+interval '5 days')::date;

  -- warranty alone
  UPDATE public.project_parties SET on_site_to=NULL, warranty_until=CURRENT_DATE+400 WHERE id=v_seat;
  SELECT l.id INTO v_new FROM public.create_field_link(v_seat) l;
  SELECT f.expires_at INTO v_exp FROM public.field_link_tokens f WHERE f.id=v_new;
  RAISE NOTICE 'B warranty alone (%) -> %', (CURRENT_DATE+400), v_exp::date;

  -- a CLOSED window, no warranty: the 90-day fallback, not a past date
  UPDATE public.project_parties SET on_site_from=CURRENT_DATE-80, on_site_to=CURRENT_DATE-40, warranty_until=NULL WHERE id=v_seat;
  SELECT l.id INTO v_new FROM public.create_field_link(v_seat) l;
  SELECT f.expires_at INTO v_exp FROM public.field_link_tokens f WHERE f.id=v_new;
  RAISE NOTICE 'C closed window (40d ago) -> % (= 90d: %)', v_exp::date, v_exp::date=(now()+interval '90 days')::date;

  -- no window at all, with a caller date
  UPDATE public.project_parties SET on_site_to=NULL, warranty_until=NULL WHERE id=v_seat;
  SELECT l.id INTO v_new FROM public.create_field_link(v_seat, now()+interval '7 days') l;
  SELECT f.expires_at INTO v_exp FROM public.field_link_tokens f WHERE f.id=v_new;
  RAISE NOTICE 'D no window + caller date 7d -> % (caller honoured: %)', v_exp::date, v_exp::date=(now()+interval '7 days')::date;

  -- a caller date in the PAST
  SELECT l.id INTO v_new FROM public.create_field_link(v_seat, now()-interval '1 day') l;
  SELECT f.expires_at INTO v_exp FROM public.field_link_tokens f WHERE f.id=v_new;
  RAISE NOTICE 'E no window + caller date in the PAST -> % (never past: %)', v_exp::date, v_exp > now();

  -- an OFF_JOB seat is still minted a fresh door (MINOR-20)
  UPDATE public.project_parties SET stage='off_job', off_job_at=CURRENT_DATE-40 WHERE id=v_seat;
  SELECT l.id INTO v_new FROM public.create_field_link(v_seat) l;
  SELECT f.expires_at INTO v_exp FROM public.field_link_tokens f WHERE f.id=v_new;
  RAISE NOTICE 'F off_job seat -> % (a fresh 90-day door: %)', v_exp::date, v_exp::date=(now()+interval '90 days')::date;

  -- the ownership guard, as a non-owner member
  PERFORM set_config('request.jwt.claims','{"sub":"a0000000-0000-0000-0000-000000000003","role":"authenticated"}', true);
  BEGIN
    SELECT l.id INTO v_new FROM public.create_field_link(v_seat) l;
    RAISE NOTICE 'G non-designer member MINTED a link (00284 guard lost)';
  EXCEPTION WHEN others THEN RAISE NOTICE 'G non-designer member refused -> %', SQLERRM;
  END;
END $$;
ROLLBACK;
