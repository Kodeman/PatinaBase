-- ═══════════════════════════════════════════════════════════════════════════
-- 00608 — the two capture doors: log_time (replay-safe) and start_timer
--         (atomic chain-out). HT-11 · HT-13 · HT-7, plan-v2 §4 (W3)
--
-- Two SECURITY INVOKER functions. RLS stays the authorization spine on both:
-- neither reads nor writes a row the caller's own policies would refuse, and
-- neither manufactures a grant. They exist for two things a PostgREST write
-- cannot express:
--
--   1. log_time — a CLIENT-MINTED id with ON CONFLICT (id) DO NOTHING, so a
--      replayed drain (Patina Field's offline queue, W6) inserts ONCE and the
--      replay still reads back the row it already wrote. A plain insert would
--      either duplicate the hour or 23505 and read as a failure.
--   2. start_timer — stop-the-incumbent and open-the-new-slot in ONE
--      transaction, and RETURN BOTH ROWS. The one-running-timer index is
--      per user GLOBALLY (uniq_project_time_entries_running_timer,
--      00177:37-41, §0.11); two tabs racing it used to land on a 23505 the
--      portal turned into a toast nobody saw (R83 mounts no ToastProvider on
--      the document surfaces). Returning the stopped row is what lets the
--      caller still raise the log-offer strip for the hour it just chained
--      out — R20/§0.22: the entry is written before the strip appears and
--      persists if ignored.
--
-- HT-11 — p_billable NULL RAISES on BOTH functions. Once every capture
-- surface carries the control, a missing value is a caught bug, not a `?? true`
-- default. This is the server half of deleting that default in
-- packages/supabase/src/hooks/use-time-tracking.ts.
--
-- HT-13 — backdating needs NO DDL. p_started_at is any PAST timestamp the
-- caller names; "until the entry is invoiced" is already enforced by
-- guard_invoiced_time_entry (00177:51-84, §0.12), which freezes started_at once
-- invoice_id is set. The "backdated" mark (> 30 days between created_at and
-- started_at) is DERIVED on the row from the two timestamps that already exist
-- — no column, and 00609 stays deliberately unused.
--
-- ── R3-m1 / W7-R5-07 (integration round 3): FORWARD IS BOUNDED ─────────────
-- "Any timestamp" was literal: `project_time_entries` carries nine CHECK
-- constraints and none of them mentions `started_at`, so a `+400d` filing was
-- written and authorized (measured at round 3). An hour is a record of work
-- already done; a future one is a typo, a bad clock or a clumsy date picker,
-- and it lands in a studio's week, its CSV and its statement.
--
-- The bound is FORWARD only, and it is deliberately loose, because HT-13-a
-- files a date-only entry at 12:00 UTC of the NAMED day: a member in UTC+14
-- naming her own today, just after local midnight, legitimately writes an
-- instant up to 26 hours ahead of `now()`. So 26 hours is the band — the widest
-- the noon-UTC convention can honestly produce — and anything past it raises.
-- Backdating stays unbounded in the other direction; that is what HT-13 is for.
--
-- The bound is on the START, not on the span end, and that is a decision rather
-- than an oversight. W6-R3-07 (Patina Field's stepper with no open visit
-- lengthening a span whose implied END walks forward) is closed where it is
-- caused — `FieldLogTimeDraft` now anchors the END and moves the START back —
-- because a server bound on `p_started_at + duration` would have to admit the
-- 26-hour band PLUS a legitimate long span and would then refuse honest hours
-- at the edge while still admitting the ones it was written for.
--
-- W4 (00610) — p_project_id may be NULL. The internal-time door is the same
-- door: project_time_entries_internal_scope_ck already requires a project-less
-- hour to name a studio and to be non-billable, so this function states no
-- second copy of that rule. p_studio_id carries it.
--
-- §0.11 — NEITHER function may open a duration_minutes IS NULL row except
-- start_timer, which is the desk's one slot. log_time RAISES on a NULL or
-- non-positive duration rather than silently opening a second running row.
--
-- Lineage: NEW functions. Nothing is redefined, no trigger is touched, no row
-- is backfilled (P-4).
-- Adds GRANT/REVOKE → supabase/seed/00-legacy-grants.sql is regenerated
-- (§0.20).
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── log_time — one hour, once, whoever replays it ──────────────────────────

CREATE OR REPLACE FUNCTION public.log_time(
  p_entry_id         uuid,
  p_project_id       uuid,
  p_started_at       timestamptz,
  p_duration_minutes integer,
  p_activity         text    DEFAULT NULL,
  p_billable         boolean DEFAULT NULL,
  p_notes            text    DEFAULT NULL,
  p_phase_key        text    DEFAULT NULL,
  p_task_id          uuid    DEFAULT NULL,
  p_source           text    DEFAULT 'manual_entry',
  p_rate_role        text    DEFAULT NULL,
  p_studio_id        uuid    DEFAULT NULL
)
RETURNS public.project_time_entries
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user  uuid := auth.uid();
  v_row   public.project_time_entries;
BEGIN
  IF p_entry_id IS NULL THEN
    RAISE EXCEPTION 'log_time: p_entry_id is required — the id is minted by the caller so a replay can be recognised';
  END IF;

  IF v_user IS NULL THEN
    RAISE EXCEPTION 'log_time: no signed-in actor';
  END IF;

  -- HT-11. A surface that does not say is a surface with a missing control.
  IF p_billable IS NULL THEN
    RAISE EXCEPTION 'log_time: p_billable must be stated (HT-11) — there is no default';
  END IF;

  -- §0.11. A running slot is start_timer's business and the desk's alone.
  IF p_duration_minutes IS NULL OR p_duration_minutes < 1 THEN
    RAISE EXCEPTION 'log_time: p_duration_minutes must be a positive number of minutes';
  END IF;

  -- R3-m1 / W7-R5-07. See the banner: forward only, 26 hours, because HT-13-a
  -- files a named day at noon UTC and the furthest-east studio zone (UTC+14)
  -- legitimately produces an instant that far ahead of now().
  IF COALESCE(p_started_at, now()) > now() + interval '26 hours' THEN
    RAISE EXCEPTION 'log_time: an hour cannot be logged in the future — % is beyond today', p_started_at
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  INSERT INTO public.project_time_entries (
    id, project_id, user_id, started_at, duration_minutes,
    activity, billable, notes, phase_key, task_id, source, rate_role, studio_id
  )
  VALUES (
    p_entry_id, p_project_id, v_user, COALESCE(p_started_at, now()), p_duration_minutes,
    p_activity, p_billable, p_notes, p_phase_key, p_task_id,
    COALESCE(p_source, 'manual_entry'), p_rate_role, p_studio_id
  )
  ON CONFLICT (id) DO NOTHING
  RETURNING * INTO v_row;

  -- The conflict arm. A replayed drain must read back the hour it already
  -- wrote, never NULL — a NULL here reads as "the write failed" and the queue
  -- tries again forever.
  IF v_row.id IS NULL THEN
    SELECT * INTO v_row
    FROM public.project_time_entries
    WHERE id = p_entry_id;

    IF v_row.id IS NULL THEN
      -- The id is taken by a row this caller's own RLS cannot read. Say so
      -- rather than returning nothing, which would read as a silent success.
      RAISE EXCEPTION 'log_time: entry % already exists and is not readable by this caller', p_entry_id
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  RETURN v_row;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.log_time(uuid,uuid,timestamptz,integer,text,boolean,text,text,uuid,text,text,uuid)
  FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.log_time(uuid,uuid,timestamptz,integer,text,boolean,text,text,uuid,text,text,uuid)
  TO authenticated;

COMMENT ON FUNCTION public.log_time(uuid,uuid,timestamptz,integer,text,boolean,text,text,uuid,text,text,uuid) IS
  'Replay-safe capture of one completed hour under a caller-minted id (00608). '
  'SECURITY INVOKER — RLS decides. p_billable NULL raises (HT-11); '
  'p_started_at is any PAST date (HT-13; frozen once invoiced by '
  'guard_invoiced_time_entry, and bounded forward at now() + 26h — the widest '
  'instant HT-13-a''s noon-UTC convention can honestly produce, R3-m1); '
  'p_project_id NULL is internal time (00610). Never opens a running slot.';

-- ── start_timer — the one slot, taken atomically, both rows returned ───────

CREATE OR REPLACE FUNCTION public.start_timer(
  p_project_id uuid,
  p_source     text    DEFAULT 'timer_auto',
  p_billable   boolean DEFAULT NULL,
  p_phase_key  text    DEFAULT NULL,
  p_task_id    uuid    DEFAULT NULL
)
RETURNS TABLE (started public.project_time_entries, stopped public.project_time_entries)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user     uuid := auth.uid();
  v_started  public.project_time_entries;
  v_stopped  public.project_time_entries;
  v_closed   public.project_time_entries;
  v_attempt  integer;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'start_timer: no signed-in actor';
  END IF;

  IF p_project_id IS NULL THEN
    -- A running slot is a document in hand. Internal time (00610) is typed,
    -- never clocked, and the CHECK that makes it non-billable has no way to
    -- price an open-ended row.
    RAISE EXCEPTION 'start_timer: p_project_id is required — a timer runs on a document';
  END IF;

  -- HT-11, same rule as log_time: the intent is stated or it is a bug.
  IF p_billable IS NULL THEN
    RAISE EXCEPTION 'start_timer: p_billable must be stated (HT-11) — there is no default';
  END IF;

  -- Two attempts. The first closes whatever this user already has open and
  -- takes the slot. A second session that opened one in the gap between our
  -- UPDATE and our INSERT trips the partial unique index; close that one too
  -- and take the slot once more. A third collision is a real fight over one
  -- person's clock and is raised rather than looped over.
  FOR v_attempt IN 1..2 LOOP
    UPDATE public.project_time_entries
       SET duration_minutes =
             GREATEST(1, ROUND(EXTRACT(EPOCH FROM (now() - started_at)) / 60.0))::integer,
           raw_seconds =
             GREATEST(0, ROUND(EXTRACT(EPOCH FROM (now() - started_at))))::integer
     WHERE user_id = v_user
       AND duration_minutes IS NULL
    RETURNING * INTO v_closed;

    -- Keep the FIRST row we closed: that is the hour the caller was working
    -- on, and the one its log-offer strip must be raised for.
    IF v_closed.id IS NOT NULL AND v_stopped.id IS NULL THEN
      v_stopped := v_closed;
    END IF;

    BEGIN
      INSERT INTO public.project_time_entries (
        project_id, user_id, started_at, duration_minutes,
        billable, phase_key, task_id, source
      )
      VALUES (
        p_project_id, v_user, now(), NULL,
        p_billable, p_phase_key, p_task_id, COALESCE(p_source, 'timer_auto')
      )
      RETURNING * INTO v_started;
      EXIT;
    EXCEPTION WHEN unique_violation THEN
      IF v_attempt = 2 THEN
        RAISE;
      END IF;
    END;
  END LOOP;

  started := v_started;
  IF v_stopped.id IS NULL THEN
    stopped := NULL;
  ELSE
    stopped := v_stopped;
  END IF;
  RETURN NEXT;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.start_timer(uuid,text,boolean,text,uuid)
  FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.start_timer(uuid,text,boolean,text,uuid)
  TO authenticated;

COMMENT ON FUNCTION public.start_timer(uuid,text,boolean,text,uuid) IS
  'Take the one running-timer slot (00177:37-41) atomically (00608): stop the '
  'incumbent, open the new row, and return BOTH so the caller can still raise '
  'the log-offer strip for the hour it chained out (R20). SECURITY INVOKER. '
  'p_billable NULL raises (HT-11).';

-- ── Postconditions — probe the objects, never the ledger (§0.2a, §11) ──────

DO $postcondition$
DECLARE
  v_def text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'log_time' AND NOT p.prosecdef
  ) THEN
    RAISE EXCEPTION '00608: log_time must exist and be SECURITY INVOKER';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'start_timer' AND NOT p.prosecdef
  ) THEN
    RAISE EXCEPTION '00608: start_timer must exist and be SECURITY INVOKER';
  END IF;

  v_def := pg_get_functiondef(
    'public.log_time(uuid,uuid,timestamptz,integer,text,boolean,text,text,uuid,text,text,uuid)'::regprocedure);
  IF v_def !~ 'ON CONFLICT \(id\) DO NOTHING' THEN
    RAISE EXCEPTION '00608: log_time must be replay-safe on the caller-minted id';
  END IF;
  IF v_def !~ 'p_billable IS NULL' THEN
    RAISE EXCEPTION '00608: log_time must raise on a missing billable (HT-11)';
  END IF;
  IF v_def !~ 'interval ''26 hours''' THEN
    RAISE EXCEPTION '00608: log_time must refuse a future started_at (R3-m1 / W7-R5-07)';
  END IF;

  v_def := pg_get_functiondef('public.start_timer(uuid,text,boolean,text,uuid)'::regprocedure);
  IF v_def !~ 'p_billable IS NULL' THEN
    RAISE EXCEPTION '00608: start_timer must raise on a missing billable (HT-11)';
  END IF;

  -- anon must never reach either door.
  IF has_function_privilege('anon',
       'public.log_time(uuid,uuid,timestamptz,integer,text,boolean,text,text,uuid,text,text,uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.start_timer(uuid,text,boolean,text,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION '00608: anon must not hold EXECUTE on the capture doors';
  END IF;

  IF NOT has_function_privilege('authenticated',
       'public.log_time(uuid,uuid,timestamptz,integer,text,boolean,text,text,uuid,text,text,uuid)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.start_timer(uuid,text,boolean,text,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION '00608: authenticated must hold EXECUTE on both capture doors';
  END IF;
END;
$postcondition$;

COMMIT;
