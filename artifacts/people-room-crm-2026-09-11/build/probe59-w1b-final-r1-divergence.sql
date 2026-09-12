\set ON_ERROR_STOP on
\pset pager off
BEGIN;
SET LOCAL role postgres;

-- P1. people_directory party branch vs people_directory_seats: does person_id
--     agree for an UNCARDED identity whose seat set mixes a Directory kind
--     (sub) with a non-Directory kind (vendor)?
DO $$
DECLARE
  v_p1 uuid := 'd0e00000-0000-0000-0000-00000000000a'; -- Okonkwo, studio b0..01
  v_p2 uuid := 'b0000000-0000-0000-0000-00000000c0d1'; -- Cedar Lane, same studio
  v_sub uuid; v_vend uuid;
  v_dir_person uuid; v_dir_seats integer; v_seat_pid uuid[];
BEGIN
  INSERT INTO project_parties (project_id, party_kind, display_name, phone, phone_e164)
  VALUES (v_p1, 'sub', 'Zeb Mixedkind', '+16125559901', '+16125559901')
  RETURNING id INTO v_sub;
  INSERT INTO project_parties (project_id, party_kind, display_name, phone, phone_e164)
  VALUES (v_p2, 'vendor', 'Zeb Mixedkind', '+16125559901', '+16125559901')
  RETURNING id INTO v_vend;
  UPDATE project_parties SET updated_at = now() - interval '2 days' WHERE id = v_sub;
  UPDATE project_parties SET updated_at = now()                     WHERE id = v_vend;

  SELECT person_id, seat_count INTO v_dir_person, v_dir_seats
    FROM people_directory WHERE display_name = 'Zeb Mixedkind';
  SELECT array_agg(DISTINCT person_id) INTO v_seat_pid
    FROM people_directory_seats WHERE display_name = 'Zeb Mixedkind';

  RAISE NOTICE 'P1 sub seat (older, IS a Directory kind)   = %', v_sub;
  RAISE NOTICE 'P1 vendor seat (newer, NOT a Directory kind) = %', v_vend;
  RAISE NOTICE 'P1 people_directory.person_id       = %  seat_count = %', v_dir_person, v_dir_seats;
  RAISE NOTICE 'P1 people_directory_seats.person_id = %', v_seat_pid;
  IF v_dir_person = ANY(v_seat_pid) THEN
    RAISE NOTICE 'P1 VERDICT: the person_id join HOLDS';
  ELSE
    RAISE NOTICE 'P1 VERDICT: *** THE person_id JOIN BREAKS *** the Directory row says % seats and nests ZERO', v_dir_seats;
  END IF;
END $$;
ROLLBACK;

-- ─────────────────────────────────────────────────────────────────────────
BEGIN;
SET LOCAL role postgres;
-- P2. create_field_link on a seat whose window has ALREADY CLOSED.
DO $$
DECLARE
  v_p1 uuid := 'd0e00000-0000-0000-0000-00000000000a';
  v_party uuid; v_tok record; v_prior uuid;
  v_exp timestamptz; v_prior_status text;
BEGIN
  INSERT INTO project_parties (project_id, party_kind, display_name, phone, phone_e164,
                               on_site_from, on_site_to)
  VALUES (v_p1, 'sub', 'Past Window Pat', '+16125559902', '+16125559902',
          '2026-01-05', '2026-03-31')
  RETURNING id INTO v_party;

  -- a LIVE link exists first (minted before the window closed, 90-day clock)
  INSERT INTO field_link_tokens (party_id, project_id, token_hash, expires_at, status)
  VALUES (v_party, v_p1, repeat('a',64), now() + interval '60 days', 'active')
  RETURNING id INTO v_prior;

  SELECT * INTO v_tok FROM public.create_field_link(v_party);
  SELECT expires_at INTO v_exp FROM field_link_tokens WHERE id = v_tok.id;
  SELECT status     INTO v_prior_status FROM field_link_tokens WHERE id = v_prior;

  RAISE NOTICE 'P2 seat window = 2026-01-05 .. 2026-03-31, warranty_until = NULL. today = %', CURRENT_DATE;
  RAISE NOTICE 'P2 new link expires_at = %   (already expired: %)', v_exp, (v_exp <= now());
  RAISE NOTICE 'P2 the previously LIVE link (expiry now + 60d) is now: %', v_prior_status;
  RAISE NOTICE 'P2 reach_state_for the seat = %', public.reach_state_for(NULL, NULL, v_party);
END $$;
ROLLBACK;

-- ─────────────────────────────────────────────────────────────────────────
BEGIN;
SET LOCAL role postgres;
-- P3. does an explicit p_expires_at survive when the seat carries a window?
DO $$
DECLARE
  v_p1 uuid := 'd0e00000-0000-0000-0000-00000000000a';
  v_party uuid; v_tok record; v_exp timestamptz;
BEGIN
  INSERT INTO project_parties (project_id, party_kind, display_name, phone, phone_e164,
                               on_site_from, on_site_to)
  VALUES (v_p1, 'sub', 'Long Window Lou', '+16125559903', '+16125559903',
          CURRENT_DATE, CURRENT_DATE + 300)
  RETURNING id INTO v_party;
  SELECT * INTO v_tok FROM public.create_field_link(v_party, now() + interval '7 days');
  SELECT expires_at INTO v_exp FROM field_link_tokens WHERE id = v_tok.id;
  RAISE NOTICE 'P3 caller asked for now()+7d; the seat window ends %; link expires %',
    CURRENT_DATE + 300, v_exp;
  RAISE NOTICE 'P3 caller date honoured? %', (v_exp < now() + interval '8 days');
END $$;
ROLLBACK;
