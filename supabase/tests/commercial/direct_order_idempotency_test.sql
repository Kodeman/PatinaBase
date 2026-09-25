-- ═══════════════════════════════════════════════════════════════════════════
-- create_direct_order is idempotent while an order is open (migration 00671,
-- W1A-11 F1 server half)
--
-- What this pins down:
--   1. Two calls with the same buyer, product and quantity return the SAME
--      order, and only one row exists. The reused copy still masks the rate.
--   2. A different quantity is a different payload and gets its own order.
--   3. A different product, or a different buyer, gets its own order.
--   4. Once the open order is PAID, or CANCELED, the next call mints a new
--      one, and the paid or canceled row is left exactly as it was.
--   5. The buyability gate still runs first. A piece that has become
--      unbuyable is refused, not handed back through its open order.
--   6. Two CONCURRENT calls (two real sessions over dblink) leave one row
--      and return the same id. A third session holds an EXCLUSIVE lock on
--      direct_orders, so both callers are inside the RPC and waiting at the
--      same time before either can insert. This does not assume how the RPC
--      serializes: without serialization both would insert once released.
--
-- Run:
--   scripts/run-sql-tests.sh -f direct_order_idempotency
--
-- Sections 1-5 run in one transaction and ROLLBACK. Section 6 commits its
-- own fixtures because dblink sessions cannot see uncommitted rows. It
-- deletes them before and after, and asserts only after cleanup.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS dblink WITH SCHEMA extensions;

BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.assume_user(p_user_id UUID)
RETURNS VOID AS $$
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', p_user_id::text, 'role', 'authenticated')::text, true);
END;
$$ LANGUAGE plpgsql;

-- ─── fixtures ──────────────────────────────────────────────────────────────
-- B1, B2 buyers with no designer relationship (so every order is uncredited
-- and attribution plays no part). PA and PB are fully buyable pieces.
-- on_auth_user_created mints each buyer's profiles row.

INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
VALUES
  ('241d0000-0000-4000-8000-0000000000b1', 'idem-b1@test.invalid', '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('241d0000-0000-4000-8000-0000000000b2', 'idem-b2@test.invalid', '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

INSERT INTO public.products
  (id, name, captured_at, layer, status, patina_managed, price_retail, price_trade,
   brand, dimensions, lead_time_weeks, photo_verified_at, shipping_flat_cents, commission_rate)
VALUES
  ('241d0000-0000-4000-8000-0000000000a1', 'IDEM Piece A', NOW(), 'catalog', 'published', true, 420000, 273000,
   'Nordic Atelier', '{"width":96,"depth":40,"height":30,"unit":"in"}'::jsonb, 10, NOW(), NULL, NULL),
  ('241d0000-0000-4000-8000-0000000000a2', 'IDEM Piece B', NOW(), 'catalog', 'published', true, 100000, 70000,
   'Prairie Workshop', '{"width":40}'::jsonb, 6, NOW(), 18000, 0.25);

DO $$
DECLARE
  b1 uuid := '241d0000-0000-4000-8000-0000000000b1';
  b2 uuid := '241d0000-0000-4000-8000-0000000000b2';
  pa uuid := '241d0000-0000-4000-8000-0000000000a1';
  pb uuid := '241d0000-0000-4000-8000-0000000000a2';
  opened  public.direct_orders;
  retry   public.direct_orders;
  other   public.direct_orders;
  stored  public.direct_orders;
  n       int;
  v_rate  numeric;
BEGIN
  -- ═══ 1. same buyer, product, quantity → the same order, one row ═══════
  PERFORM pg_temp.assume_user(b1);
  opened := public.create_direct_order(pa, 1);
  retry := public.create_direct_order(pa, 1);

  ASSERT retry.id = opened.id,
    format('a repeat call must return the open order %s, got %s', opened.id, retry.id);
  SELECT count(*) INTO n FROM public.direct_orders WHERE client_id = b1 AND product_id = pa;
  ASSERT n = 1, 'a repeat call must not insert a second row, got ' || n;
  ASSERT retry.status = 'pending_payment' AND retry.amount_cents = opened.amount_cents
     AND retry.quantity = 1,
    format('the reused order must come back as it was minted: %s', retry);
  ASSERT retry.commission_rate IS NULL,
    'the reused copy must mask the rate, same as a minted one (00540 §1b)';
  SELECT commission_rate INTO v_rate FROM public.direct_orders WHERE id = opened.id;
  ASSERT v_rate IS NOT NULL, 'the stored rate snapshot is untouched';

  -- ═══ 2. a different quantity is a different payload ════════════════════
  other := public.create_direct_order(pa, 2);
  ASSERT other.id <> opened.id AND other.quantity = 2,
    format('a different quantity must mint its own order, got %s', other);
  SELECT count(*) INTO n FROM public.direct_orders WHERE client_id = b1 AND product_id = pa;
  ASSERT n = 2, 'one row per open payload, got ' || n;

  -- ═══ 3. a different product, and a different buyer, are separate ═══════
  other := public.create_direct_order(pb, 1);
  ASSERT other.id <> opened.id AND other.product_id = pb,
    format('a different product must mint its own order, got %s', other);
  SELECT count(*) INTO n FROM public.direct_orders WHERE client_id = b1 AND product_id = pb;
  ASSERT n = 1, 'exactly one order for the second product, got ' || n;

  PERFORM pg_temp.assume_user(b2);
  other := public.create_direct_order(pa, 1);
  ASSERT other.id <> opened.id AND other.client_id = b2,
    format('another buyer must never be handed b1''s order, got %s', other);
  PERFORM pg_temp.assume_user(b1);

  -- ═══ 4a. once PAID, the next call mints a new order ════════════════════
  UPDATE public.direct_orders SET status = 'paid', paid_at = NOW() WHERE id = opened.id;

  retry := public.create_direct_order(pa, 1);
  ASSERT retry.id <> opened.id AND retry.status = 'pending_payment',
    format('a paid order must never be reused, got %s', retry);
  SELECT * INTO stored FROM public.direct_orders WHERE id = opened.id;
  ASSERT stored.status = 'paid' AND stored.paid_at IS NOT NULL
     AND stored.amount_cents = opened.amount_cents AND stored.quantity = opened.quantity,
    format('the paid order must be left as it was, got %s', stored);

  -- …and the new open order is itself the one a retry gets back.
  other := public.create_direct_order(pa, 1);
  ASSERT other.id = retry.id,
    format('the new open order must be reused in turn: %s vs %s', retry.id, other.id);

  -- ═══ 4b. once CANCELED, the next call mints a new order ════════════════
  UPDATE public.direct_orders SET status = 'canceled' WHERE id = retry.id;

  other := public.create_direct_order(pa, 1);
  ASSERT other.id <> retry.id AND other.id <> opened.id,
    format('a canceled order must never be reused, got %s', other.id);
  SELECT status INTO stored.status FROM public.direct_orders WHERE id = retry.id;
  ASSERT stored.status = 'canceled', 'the canceled order must stay canceled, got ' || stored.status;
  SELECT count(*) INTO n FROM public.direct_orders
   WHERE client_id = b1 AND product_id = pa AND quantity = 1;
  ASSERT n = 3, 'paid + canceled + the one open order, got ' || n;

  -- ═══ 5. the gate still runs before the reuse ═══════════════════════════
  -- b1 holds an open order for PB (section 3). Once PB is soft-deleted the
  -- call must refuse as it always has, not return that order.
  UPDATE public.products SET deleted_at = NOW() WHERE id = pb;
  BEGIN
    PERFORM public.create_direct_order(pb, 1);
    ASSERT false, 'an unbuyable piece must be refused even with an open order';
  EXCEPTION WHEN raise_exception THEN
    ASSERT SQLERRM = format('create_direct_order: product %s not found', pb),
      'expected the unchanged not-found refusal, got: ' || SQLERRM;
  END;
END $$;

ROLLBACK;

-- ─── 6. two concurrent calls leave one row ─────────────────────────────────
DO $$
DECLARE
  v_conninfo text := format(
    'hostaddr=%s port=%s dbname=postgres user=postgres password=postgres',
    inet_server_addr(), inet_server_port()
  );
  b uuid := '241d0000-0000-4000-8000-0000000000b3';
  p uuid := '241d0000-0000-4000-8000-0000000000a3';
  v_cleanup text;
  v_race text;
  v_pid_a int;
  v_pid_b int;
  v_waiting int := 0;
  v_id_a text;
  v_id_b text;
  v_err_a text;
  v_err_b text;
  v_rows int;
BEGIN
  v_cleanup := format($c$
    DELETE FROM public.direct_orders WHERE client_id = %1$L;
    DELETE FROM public.products WHERE id = %2$L;
    DELETE FROM public.profiles WHERE id = %1$L;
    DELETE FROM auth.users WHERE id = %1$L;
  $c$, b, p);
  v_race := format(
    'SELECT o.id::text FROM public.create_direct_order(%L::uuid, 1) AS o', p);

  PERFORM extensions.dblink_connect('idem_setup', v_conninfo);
  PERFORM extensions.dblink_exec('idem_setup',
    'SET lock_timeout = ''5s''; SET statement_timeout = ''30s''');
  PERFORM extensions.dblink_exec('idem_setup', v_cleanup);   -- a run that died mid-way
  PERFORM extensions.dblink_exec('idem_setup', format($s$
    INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at,
                            created_at, updated_at, instance_id, aud, role)
    VALUES (%1$L, 'idem-race@test.invalid', '', now(), now(), now(),
            '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
    INSERT INTO public.products
      (id, name, captured_at, layer, status, patina_managed, price_retail, price_trade,
       brand, dimensions, lead_time_weeks, photo_verified_at)
    VALUES (%2$L, 'IDEM Race Piece', now(), 'catalog', 'published', true, 420000, 273000,
            'Nordic Atelier', '{"width":96}'::jsonb, 10, now());
  $s$, b, p));

  PERFORM extensions.dblink_connect('idem_locker', v_conninfo);
  PERFORM extensions.dblink_connect('idem_racer_a', v_conninfo);
  PERFORM extensions.dblink_connect('idem_racer_b', v_conninfo);
  PERFORM extensions.dblink_exec('idem_locker',
    'SET lock_timeout = ''10s''; SET statement_timeout = ''30s''');
  PERFORM extensions.dblink_exec('idem_racer_a',
    'SET lock_timeout = ''10s''; SET statement_timeout = ''30s''');
  PERFORM extensions.dblink_exec('idem_racer_b',
    'SET lock_timeout = ''10s''; SET statement_timeout = ''30s''');

  -- Both racers call as the buyer, through the authenticated grant.
  PERFORM extensions.dblink_exec('idem_racer_a', 'SET ROLE authenticated');
  PERFORM extensions.dblink_exec('idem_racer_a', format(
    'SET request.jwt.claims = %L',
    json_build_object('sub', b::text, 'role', 'authenticated')::text));
  PERFORM extensions.dblink_exec('idem_racer_b', 'SET ROLE authenticated');
  PERFORM extensions.dblink_exec('idem_racer_b', format(
    'SET request.jwt.claims = %L',
    json_build_object('sub', b::text, 'role', 'authenticated')::text));
  SELECT r.pid INTO v_pid_a
    FROM extensions.dblink('idem_racer_a', 'SELECT pg_backend_pid()') AS r(pid int);
  SELECT r.pid INTO v_pid_b
    FROM extensions.dblink('idem_racer_b', 'SELECT pg_backend_pid()') AS r(pid int);

  -- Hold writes to direct_orders. Plain reads still pass.
  PERFORM extensions.dblink_exec('idem_locker', 'BEGIN');
  PERFORM extensions.dblink_exec('idem_locker',
    'LOCK TABLE public.direct_orders IN EXCLUSIVE MODE');

  PERFORM extensions.dblink_send_query('idem_racer_a', v_race);
  PERFORM extensions.dblink_send_query('idem_racer_b', v_race);

  -- Wait, bounded (5s), until BOTH racers are blocked on a lock inside the
  -- call. pg_locks is read live on every call, unlike pg_stat_activity.
  FOR i IN 1..100 LOOP
    SELECT count(DISTINCT l.pid) INTO v_waiting
      FROM pg_locks l
     WHERE l.pid IN (v_pid_a, v_pid_b) AND NOT l.granted;
    EXIT WHEN v_waiting = 2;
    PERFORM pg_sleep(0.05);
  END LOOP;

  PERFORM extensions.dblink_exec('idem_locker', 'COMMIT');

  SELECT r.id INTO v_id_a
    FROM extensions.dblink_get_result('idem_racer_a', false) AS r(id text);
  v_err_a := extensions.dblink_error_message('idem_racer_a');
  SELECT r.id INTO v_id_b
    FROM extensions.dblink_get_result('idem_racer_b', false) AS r(id text);
  v_err_b := extensions.dblink_error_message('idem_racer_b');

  SELECT r.n INTO v_rows
    FROM extensions.dblink('idem_setup', format(
      'SELECT count(*)::int FROM public.direct_orders WHERE client_id = %L AND product_id = %L',
      b, p)) AS r(n int);

  PERFORM extensions.dblink_disconnect('idem_racer_b');
  PERFORM extensions.dblink_disconnect('idem_racer_a');
  PERFORM extensions.dblink_disconnect('idem_locker');
  PERFORM extensions.dblink_exec('idem_setup', v_cleanup);
  PERFORM extensions.dblink_disconnect('idem_setup');

  ASSERT v_waiting = 2,
    format('both racers must be waiting inside create_direct_order at once, saw %s', v_waiting);
  ASSERT v_err_a = 'OK' AND v_err_b = 'OK',
    format('both concurrent calls must succeed: a=%L b=%L', v_err_a, v_err_b);
  ASSERT v_id_a IS NOT NULL AND v_id_a = v_id_b,
    format('both concurrent calls must return the same order: a=%s b=%s', v_id_a, v_id_b);
  ASSERT v_rows = 1,
    format('two concurrent calls must leave exactly one row, got %s', v_rows);
END $$;
