\set ON_ERROR_STOP on
BEGIN;
SET LOCAL role authenticated;
SELECT set_config('request.jwt.claims','{"sub":"a0000000-0000-0000-0000-000000000004","role":"authenticated"}', true);

\echo '=== G1: r3 MAJOR-2 re-check — no Directory row claims a seat_count it cannot nest ==='
SELECT count(*) FILTER (WHERE pd.seat_count <> n.nested) AS rows_where_count_disagrees,
       count(*) AS total_rows
  FROM public.people_directory pd
  CROSS JOIN LATERAL (
    SELECT count(*)::int AS nested FROM public.people_directory_seats s
     WHERE s.person_id = pd.person_id
  ) n;

\echo '=== G2: the four branches with a domain-table person_id all claim 0 ==='
SELECT role, count(*) AS rows, min(seat_count) AS min_count, max(seat_count) AS max_count
  FROM public.people_directory WHERE role IN ('client','lead','maker','team') GROUP BY 1 ORDER BY 1;

\echo '=== G3: r3 tests MAJOR-1 re-check — the three consent faces of a row always agree ==='
SELECT count(*) FILTER (
         WHERE role IN ('gc','sub','installer','receiver','architect','photographer','stager')
           AND NOT (status_raw = consent_status AND (meta->>'sms_consent_status') = consent_status)
       ) AS party_rows_with_disagreeing_faces,
       count(*) FILTER (WHERE role IN ('gc','sub','installer','receiver','architect','photographer','stager')) AS party_rows
  FROM public.people_directory;

\echo '=== G4: no Directory row is MORE permissive than any seat beneath it ==='
WITH pairs AS (
  SELECT pd.display_name, pd.consent_status AS row_word, s.consent_status AS seat_word
    FROM public.people_directory pd
    JOIN public.people_directory_seats s ON s.person_id = pd.person_id
   WHERE pd.consent_status IS NOT NULL
), rank AS (
  SELECT *,
    CASE row_word WHEN 'opted_out' THEN 0 WHEN 'not_asked' THEN 1 WHEN 'pending' THEN 2 ELSE 3 END AS r,
    CASE seat_word WHEN 'opted_out' THEN 0 WHEN 'not_asked' THEN 1 WHEN 'pending' THEN 2 ELSE 3 END AS s
  FROM pairs
)
SELECT count(*) AS pairs, count(*) FILTER (WHERE r > s) AS row_softer_than_a_seat FROM rank;

\echo '=== G5: PR-p — people_directory still carries no stage column; PR-r — no code column ==='
SELECT count(*) FILTER (WHERE table_name='people_directory'   AND column_name='stage') AS directory_stage_cols,
       count(*) FILTER (WHERE table_name='project_site_access_cards'
                          AND column_name ~* 'code|show_to_client')                   AS site_card_code_cols
  FROM information_schema.columns
 WHERE table_schema='public';

\echo '=== G6: create_field_link — the windows the seed mints ==='
SELECT pp.display_name, pj.name AS project, pp.on_site_to, pp.warranty_until,
       f.expires_at::date AS link_ends, f.status
  FROM public.field_link_tokens f
  JOIN public.project_parties pp ON pp.id=f.party_id
  JOIN public.projects pj ON pj.id=f.project_id
 ORDER BY 1,2;
ROLLBACK;

\echo '=== G7: create_field_link — every branch, as the owner ==='
BEGIN;
SET LOCAL role authenticated;
SELECT set_config('request.jwt.claims','{"sub":"a0000000-0000-0000-0000-000000000004","role":"authenticated"}', true);
DO $$
DECLARE v_seat uuid; v_exp timestamptz; r record;
BEGIN
  -- a seat with a LIVE window
  SELECT pp.id INTO v_seat FROM public.project_parties pp JOIN public.projects pj ON pj.id=pp.project_id
   WHERE pj.designer_id='a0000000-0000-0000-0000-000000000004' AND pp.on_site_to > CURRENT_DATE LIMIT 1;
  SELECT expires_at INTO v_exp FROM public.field_link_tokens
   WHERE id = (SELECT id FROM public.create_field_link(v_seat, now() + interval '5 days'));
  RAISE NOTICE 'live window + caller date -> %  (window end %)', v_exp::date,
    (SELECT on_site_to FROM public.project_parties WHERE id=v_seat);

  -- a seat whose window CLOSED
  SELECT pp.id INTO v_seat FROM public.project_parties pp JOIN public.projects pj ON pj.id=pp.project_id
   WHERE pj.designer_id='a0000000-0000-0000-0000-000000000004'
     AND pp.on_site_to < CURRENT_DATE AND pp.warranty_until IS NULL LIMIT 1;
  IF v_seat IS NOT NULL THEN
    SELECT expires_at INTO v_exp FROM public.field_link_tokens
     WHERE id = (SELECT id FROM public.create_field_link(v_seat));
    RAISE NOTICE 'closed window, no caller date -> % (90d fallback = %)', v_exp::date, (now()+interval '90 days')::date;
  ELSE RAISE NOTICE 'no closed-window seat without warranty in this fixture'; END IF;

  -- a seat with NO window at all
  SELECT pp.id INTO v_seat FROM public.project_parties pp JOIN public.projects pj ON pj.id=pp.project_id
   WHERE pj.designer_id='a0000000-0000-0000-0000-000000000004'
     AND pp.on_site_to IS NULL AND pp.warranty_until IS NULL LIMIT 1;
  SELECT expires_at INTO v_exp FROM public.field_link_tokens
   WHERE id = (SELECT id FROM public.create_field_link(v_seat));
  RAISE NOTICE 'no window, no caller date -> % (90d = %)', v_exp::date, (now()+interval '90 days')::date;
END $$;
ROLLBACK;
