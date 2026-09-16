-- ═══════════════════════════════════════════════════════════════════════════
-- 00616 — the activity vocabulary gains 'travel'. HT-19, plan-v2 §7 (W6)
--
-- LEAH-1 walked the day and found the hole: the drive is the part of the hour
-- Patina could never name. `activity` has admitted design / sourcing / client /
-- site_visit / admin since 00198:27-29 and nothing else, so a field worker's
-- drive between two houses had to be logged as one of those or not logged.
--
-- ── WHY CATALOG-RESOLVING DDL AND NOT A HARDCODED CONSTRAINT NAME ─────────
-- 00198 added `activity` with an INLINE, UNNAMED check:
--     activity text
--       check (activity is null
--              or activity in ('design','sourcing','client','site_visit','admin')),
-- so its name is whatever Postgres generated at apply time — conventionally
-- `project_time_entries_activity_check`, but that string appears in NO
-- migration in this repo and has never been verified against the prod catalog.
-- This is exactly the position 00545 was in for `source`, and this file follows
-- 00545:33-43's precedent verbatim: RESOLVE the 00198-era constraint from
-- pg_constraint by what it SAYS rather than by what it is CALLED, drop every
-- match, then add a deliberately NAMED `project_time_entries_activity_ck` so
-- the next widening costs one line instead of another archaeology dig.
--
-- Pinned to the `activity` column via `conkey`, never a LIKE '%(activity)%'
-- text match: Postgres canonicalizes `activity IN ('a','b')` to
-- `CHECK (((activity IS NULL) OR (activity = ANY (ARRAY['a'::text, …]))))`, so
-- the substring "(activity)" never appears and that pattern would match
-- nothing — turning every apply into the "could not find" raise below. LOOPed,
-- not LIMIT 1: a duplicated twin constraint would otherwise survive and keep
-- rejecting 'travel' after the ADD CONSTRAINT appeared to succeed (00545's F3).
--
-- This is a CHECK, not a Postgres enum, so the widening and any use of the new
-- value may share a transaction — nothing here has to wait a migration.
--
-- IDEMPOTENT: re-running CONVERGES. The DO block's guard only short-circuits
-- the resolve-by-content search; the unconditional DROP CONSTRAINT IF EXISTS …
-- ADD CONSTRAINT below runs on every apply and reaches the same end state.
-- REVERSIBLE: drop `project_time_entries_activity_ck` and re-add 00198's
-- five-value CHECK under whatever name the catalog then wants.
--
-- LOCK COST: ADD CONSTRAINT … CHECK takes ACCESS EXCLUSIVE on
-- project_time_entries and validates every existing row — Postgres cannot skip
-- that scan on a plain ADD. The widening is strictly MORE permissive than
-- 00198's five-value CHECK, so no existing row can fail it; the cost is the
-- scan, not a risk of failure.
--
-- Lineage: 00198 (inline, unnamed) → 00616 (named). No function is redefined,
-- no trigger is touched, no row is backfilled (P-4).
-- No GRANT/REVOKE in this file → the ACL seed is unchanged (§0.20).
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

DO $widen_activity$
DECLARE
  v_conname text;
  v_found   boolean := false;
BEGIN
  -- Already widened (a re-apply, or a branch that landed this first): nothing
  -- to resolve. The unconditional ALTER below still runs and converges.
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.project_time_entries'::regclass
      AND conname = 'project_time_entries_activity_ck'
  ) THEN
    v_found := true;
  END IF;

  FOR v_conname IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.project_time_entries'::regclass
      AND contype = 'c'
      AND conname <> 'project_time_entries_activity_ck'
      AND pg_get_constraintdef(oid) LIKE '%site_visit%'
      AND pg_get_constraintdef(oid) LIKE '%sourcing%'
      AND conkey = ARRAY[(
        SELECT attnum FROM pg_attribute
         WHERE attrelid = 'public.project_time_entries'::regclass
           AND attname = 'activity'
      )]
  LOOP
    v_found := true;
    EXECUTE format(
      'ALTER TABLE public.project_time_entries DROP CONSTRAINT %I', v_conname);
  END LOOP;

  IF NOT v_found THEN
    RAISE EXCEPTION
      '00616: could not find the 00198 activity CHECK on project_time_entries';
  END IF;
END
$widen_activity$;

ALTER TABLE public.project_time_entries
  DROP CONSTRAINT IF EXISTS project_time_entries_activity_ck,
  ADD CONSTRAINT project_time_entries_activity_ck CHECK (
    activity IS NULL
    OR activity IN ('design', 'sourcing', 'client', 'site_visit', 'admin', 'travel')
  );

COMMENT ON COLUMN public.project_time_entries.activity IS
  'R4 designer-picked activity. design · sourcing · client · site_visit · '
  'admin · travel (00616, HT-19 — the drive between two houses is an hour of '
  'the studio''s day and had no name before). NULL is "activity not set" and '
  'stays honest (HT-24) — never a silent ''design''. Phase attribution '
  'auto-fills separately via phase_key.';

-- ── Postconditions — probe the catalog, never the ledger (§0.2a, §11) ──────
--
-- Two halves, both needed. A constraint NAMED …_activity_ck whose definition
-- merely mentions 'travel' is satisfied by an expression keyed on a different
-- column, or by one that quietly lost a 00198 value. So: the definition is
-- pinned to the `activity` column by conkey, and EVERY admitted value is
-- asserted by name — a widening that narrowed something else is a regression.
DO $postcondition$
DECLARE
  v_def text;
  v_val text;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO v_def
  FROM pg_constraint
  WHERE conrelid = 'public.project_time_entries'::regclass
    AND contype = 'c'
    AND conname = 'project_time_entries_activity_ck'
    AND conkey = ARRAY[(
      SELECT attnum FROM pg_attribute
       WHERE attrelid = 'public.project_time_entries'::regclass
         AND attname = 'activity'
    )];

  IF v_def IS NULL THEN
    RAISE EXCEPTION
      '00616: project_time_entries_activity_ck is missing or is not keyed on the activity column';
  END IF;

  FOREACH v_val IN ARRAY ARRAY[
    'design', 'sourcing', 'client', 'site_visit', 'admin', 'travel']
  LOOP
    IF v_def NOT LIKE '%''' || v_val || '''%' THEN
      RAISE EXCEPTION
        '00616: project_time_entries_activity_ck does not admit %, got %',
        v_val, v_def;
    END IF;
  END LOOP;

  -- "activity not set" must stay expressible: the column is nullable and the
  -- CHECK's NULL arm is what keeps HT-24's honest empty state legal.
  IF v_def NOT LIKE '%IS NULL%' THEN
    RAISE EXCEPTION
      '00616: project_time_entries_activity_ck no longer admits NULL, got %', v_def;
  END IF;

  -- Exactly one CHECK may be keyed on `activity`. Two would mean the 00198-era
  -- constraint survived under a second name and still rejects 'travel'.
  IF (
    SELECT count(*) FROM pg_constraint
    WHERE conrelid = 'public.project_time_entries'::regclass
      AND contype = 'c'
      AND conkey = ARRAY[(
        SELECT attnum FROM pg_attribute
         WHERE attrelid = 'public.project_time_entries'::regclass
           AND attname = 'activity'
      )]
  ) <> 1 THEN
    RAISE EXCEPTION
      '00616: more than one CHECK is keyed on project_time_entries.activity';
  END IF;

  -- §0.11, carried forward from 00545's own postcondition: Field logs
  -- completed hours, and the one-running-timer slot is the desk's.
  IF to_regclass('public.uniq_project_time_entries_running_timer') IS NULL THEN
    RAISE EXCEPTION
      '00616: the one-running-timer-per-user index is gone — Field''s "never a running timer" rule lost its enforcement';
  END IF;
END
$postcondition$;

COMMIT;
