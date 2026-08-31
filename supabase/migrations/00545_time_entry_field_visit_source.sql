-- ═══════════════════════════════════════════════════════════════════════════
-- 00545_time_entry_field_visit_source.sql — the TIME-ENTRY MIGRATION (Field
-- Companion wave 4, package 4-10). Spec:
-- docs/design/field-companion/field-companion-package.md §9.5.
--
-- ⚠ NUMBERED 00545 — NOT drawn from the reserved band 00530–00535 (FC-R17).
--   That band is CLOSED/EXHAUSTED: `00530` and `00532` are this program's
--   (waves 1 and 3), `00531` is an unrelated `uuid_generate_v5` grant hotfix,
--   and `00533`/`00534`/`00535` were drawn by OTHER lanes
--   (`00533_piece_detail_contract.sql`, `00534_client_attention_notifications.sql`,
--   `00535_saved_items_price_snapshot.sql`) before wave 4 ran its landing
--   census. Wave 4 drew `00543–00545` above the head (`00542`) instead — see
--   docs/engineering/migration-number-reservations.md. This file already
--   lives in supabase/migrations/, not docs/design/field-companion/plans/sql/.
--
-- ── WHAT AND WHY ─────────────────────────────────────────────────────────
-- V4 (the visit review) offers, on one tap, a COMPLETED `project_time_entries`
-- row for the visit she just closed: `activity = 'site_visit'`,
-- `duration_minutes > 0`. `activity` already admits 'site_visit'
-- (00198:27-29) — nothing to widen there. `source` does not: 00198:25-26
-- admits only ('timer_auto','timer_manual','manual_entry'), and none of those
-- three is true of a row the phone wrote from a closed visit. This migration
-- adds 'field_visit'.
--
-- ⚠ NEVER A RUNNING TIMER. `uniq_project_time_entries_running_timer`
--   (00177:39-41) is a partial UNIQUE index on (user_id) WHERE
--   duration_minutes IS NULL — one running timer per user, and that one
--   belongs to the portal's TimerButton. A Field-written row with a NULL
--   duration would either steal her desk timer's slot or fail on the unique
--   index. V4 writes a completed entry or writes nothing.
--
-- ── WHY CATALOG-RESOLVING DDL AND NOT A HARDCODED CONSTRAINT NAME ────────
-- 00198 added `source` with an INLINE, UNNAMED check:
--     source text not null default 'timer_manual'
--       check (source in ('timer_auto', 'timer_manual', 'manual_entry')),
-- so its name is whatever Postgres generated at apply time — conventionally
-- `project_time_entries_source_check`, but that string appears in NO migration
-- in this repo and has never been verified against the prod catalog. Prod is
-- live; MEMORY.md records prod-vs-local shape divergence biting this program
-- before. So this migration RESOLVES the constraint from `pg_constraint` by
-- what it says rather than by what it is called, drops that, and adds a
-- deliberately NAMED replacement so the next widening is cheap.
--
-- IDEMPOTENT: re-running CONVERGES — it does not "do nothing". The DO block's
-- guard only short-circuits the pg_constraint resolve-by-content search
-- (skips looking for and dropping a differently-named 00198-era CHECK); the
-- unconditional `ALTER TABLE … DROP CONSTRAINT IF EXISTS
-- project_time_entries_source_ck, ADD CONSTRAINT … CHECK (...)` below runs on
-- EVERY apply regardless of the guard, so a re-run always drops and re-adds
-- (and therefore re-validates — see LOCK COST below) the named constraint,
-- even when it already admits 'field_visit'. The end state is identical
-- either way; the work to reach it on a re-run is not free.
-- REVERSIBLE: drop `project_time_entries_source_ck` and re-add the 00198
-- three-value CHECK under whatever name the catalog then wants.
--
-- LOCK COST: `ALTER TABLE … ADD CONSTRAINT … CHECK` takes ACCESS EXCLUSIVE on
-- project_time_entries and a full validation scan of every existing row —
-- Postgres cannot skip that scan on a plain ADD CONSTRAINT the way it can
-- with NOT VALID. The widening here is strictly MORE permissive than 00198's
-- three-value CHECK (every row that satisfied the old CHECK still satisfies
-- the new one), so validation cannot fail; the cost is lock duration, not
-- risk of failure. A NOT VALID + separate VALIDATE CONSTRAINT split was
-- considered and not taken: VALIDATE would need its own transaction (running
-- it inside the same transaction as the NOT VALID ADD still takes the
-- stronger lock for the ADD, buying nothing), and this migration's discipline
-- is one file, one transaction, one COMMIT.
--
-- ACLs: no new routine, so constraint C7 does not apply.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

DO $widen_source$
DECLARE
  v_conname text;
  v_already boolean;
  v_found   boolean := false;
BEGIN
  -- Already widened BY THIS MIGRATION? Nothing to do.
  --
  -- ⚠ Keyed on the constraint NAME, not merely on "some CHECK mentions
  -- field_visit". If a widening ever landed under a different name, the loose
  -- test would return early here and leave that constraint in place — while the
  -- unconditional DROP … / ADD project_time_entries_source_ck below still ran,
  -- giving the column two CHECKs. Named, the guard and the ADD agree: either
  -- our constraint already admits field_visit and we stop, or we resolve
  -- whatever source CHECK exists by content, drop it, and add ours.
  SELECT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.project_time_entries'::regclass
      AND contype = 'c'
      AND conname = 'project_time_entries_source_ck'
      AND pg_get_constraintdef(oid) LIKE '%field_visit%'
  ) INTO v_already;

  IF v_already THEN
    RAISE NOTICE 'project_time_entries.source already admits field_visit — skipping';
    RETURN;
  END IF;

  -- Resolve 00198's inline CHECK by its content, not by a guessed name.
  --
  -- ⚠ F3: LOOP over every match, not a single-row LIMIT 1 pick with no
  -- ORDER BY. If a duplicated twin constraint (same content, different name/
  -- oid) ever existed on this column, LIMIT 1 would drop only one of them —
  -- arbitrarily, since there is no ORDER BY — leaving the other in place to
  -- silently keep rejecting 'field_visit' even after the ADD CONSTRAINT below
  -- appears to succeed. Drop every match instead.
  --
  -- Pinned to the `source` column via `conkey`, not a `LIKE '%(source)%'`
  -- text match on pg_get_constraintdef(): verified against a local probe,
  -- Postgres canonicalizes `source IN ('a','b')` to
  -- `CHECK ((source = ANY (ARRAY['a'::text, 'b'::text])))` — the substring
  -- "(source)" never appears, so that LIKE pattern would match nothing and
  -- turn every apply into the "could not find" exception below. `conkey`
  -- against the `source` column's attnum is the exact, non-brittle way to
  -- say the same thing: an unrelated CHECK that happens to mention the same
  -- two literals but is not keyed on `source` cannot be resolved and dropped
  -- by accident.
  FOR v_conname IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.project_time_entries'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%timer_manual%'
      AND pg_get_constraintdef(oid) LIKE '%manual_entry%'
      AND conkey = ARRAY[(
        SELECT attnum FROM pg_attribute
         WHERE attrelid = 'public.project_time_entries'::regclass
           AND attname = 'source'
      )]
  LOOP
    v_found := true;
    EXECUTE format(
      'ALTER TABLE public.project_time_entries DROP CONSTRAINT %I', v_conname);
  END LOOP;

  IF NOT v_found THEN
    RAISE EXCEPTION
      'time-entry migration: could not find the 00198 source CHECK on project_time_entries';
  END IF;
END
$widen_source$;

ALTER TABLE public.project_time_entries
  DROP CONSTRAINT IF EXISTS project_time_entries_source_ck,
  ADD CONSTRAINT project_time_entries_source_ck CHECK (
    source IN ('timer_auto', 'timer_manual', 'manual_entry', 'field_visit')
  );

COMMENT ON COLUMN public.project_time_entries.source IS
  'timer_auto = document spine timer (D11) · timer_manual = header TimerButton '
  '· manual_entry = typed in · field_visit = offered by Patina Field''s visit '
  'review when a visit closes (Field Companion wave 4). A field_visit row is '
  'always COMPLETED — duration_minutes > 0, never a running timer.';

DO $postcondition$
DECLARE
  v_admits boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.project_time_entries'::regclass
      AND conname = 'project_time_entries_source_ck'
      AND pg_get_constraintdef(oid) LIKE '%field_visit%'
  ) INTO v_admits;
  IF NOT v_admits THEN
    RAISE EXCEPTION
      'time-entry migration: project_time_entries_source_ck does not admit field_visit';
  END IF;

  IF to_regclass('public.uniq_project_time_entries_running_timer') IS NULL THEN
    RAISE EXCEPTION
      'time-entry migration: the one-running-timer-per-user index is gone — V4''s "never a running timer" rule lost its enforcement';
  END IF;
END
$postcondition$;

-- ⚠ F4: the check above only proves a constraint NAMED
-- project_time_entries_source_ck exists whose pg_get_constraintdef() text
-- happens to mention 'field_visit' — that is satisfied by a constraint whose
-- CHECK expression is syntactically broken, disjoint from `source`, or
-- otherwise inert, as long as the string 'field_visit' appears in it
-- somewhere. It is not proof an actual INSERT with source = 'field_visit'
-- succeeds. This is the behavioural proof: inside a SAVEPOINT (so it leaves
-- no trace and the fixture rows never reach the committed migration), insert
-- a real row with source = 'field_visit' and roll back to the savepoint. If
-- the widening did not really take, this INSERT raises a check_violation and
-- the whole migration fails loudly here, at apply time, instead of silently
-- rejecting Field's first V4 write on prod.
SAVEPOINT f4_field_visit_behavioural_check;

DO $behavioural_check$
DECLARE
  v_user_id    uuid := gen_random_uuid();
  v_project_id uuid;
BEGIN
  INSERT INTO auth.users (
    id, email, encrypted_password, email_confirmed_at, created_at, updated_at,
    instance_id, aud, role)
  VALUES (
    v_user_id, 'f4-behavioural-check@migration.invalid', '', now(), now(), now(),
    '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

  INSERT INTO public.projects (id, name, designer_id, created_by)
  VALUES (gen_random_uuid(), 'F4 behavioural check (rolled back)', v_user_id, v_user_id)
  RETURNING id INTO v_project_id;

  INSERT INTO public.project_time_entries (
    project_id, user_id, duration_minutes, source, activity)
  VALUES (v_project_id, v_user_id, 5, 'field_visit', 'site_visit');
END
$behavioural_check$;

ROLLBACK TO SAVEPOINT f4_field_visit_behavioural_check;

COMMIT;
