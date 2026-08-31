-- ═══════════════════════════════════════════════════════════════════════════
-- 00545_time_entry_field_visit_source.sql — the TIME-ENTRY MIGRATION (Field
-- Companion wave 4, package 4-10). Spec:
-- docs/design/field-companion/field-companion-package.md §9.5.
--
-- ⚠ NN IS DRAWN AT LANDING from the reserved band 00530–00535 (FC-R17), after
--   re-checking BOTH docs/engineering/migration-number-reservations.md AND
--   `supabase migration list` against Strata (constraint C6). This file lives
--   under docs/design/field-companion/plans/sql/ until then.
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
-- IDEMPOTENT: re-running finds a constraint that already admits 'field_visit'
-- and does nothing.
-- REVERSIBLE: drop `project_time_entries_source_ck` and re-add the 00198
-- three-value CHECK under whatever name the catalog then wants.
--
-- ACLs: no new routine, so constraint C7 does not apply.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

DO $widen_source$
DECLARE
  v_conname text;
  v_already boolean;
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
  SELECT conname INTO v_conname
  FROM pg_constraint
  WHERE conrelid = 'public.project_time_entries'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%timer_manual%'
    AND pg_get_constraintdef(oid) LIKE '%manual_entry%'
  LIMIT 1;

  IF v_conname IS NULL THEN
    RAISE EXCEPTION
      'time-entry migration: could not find the 00198 source CHECK on project_time_entries';
  END IF;

  EXECUTE format(
    'ALTER TABLE public.project_time_entries DROP CONSTRAINT %I', v_conname);
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

COMMIT;
