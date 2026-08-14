-- ═══════════════════════════════════════════════════════════════════════════
-- 00479 — project_tasks.starts_on: the working-window start (Date
-- Instruments program, Lane C — data)
--
-- 00169 gave project_tasks a single `due_date`: a task has always had an end,
-- never a beginning. The Calendar Folio (the program's task-week view) needs
-- to draw a task as a SPAN, not a point — so the task needs a start alongside
-- the end it already had. `due_date` keeps its meaning unchanged (the window
-- end); `starts_on` is purely additive and nullable, so every existing task
-- (a point, not a span) reads exactly as it always has.
--
-- Idempotent: guarded ADD COLUMN, and the ordering CHECK is added only if a
-- constraint of that name does not already exist (pg_constraint probe, the
-- same idiom 00475/00476 use via their `DO $$ ... EXCEPTION WHEN
-- duplicate_object` guards) — added NOT VALID then VALIDATEd separately so an
-- existing table with rows is never blocked from getting the column, only
-- from lying about spans once the constraint is live.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.project_tasks
  ADD COLUMN IF NOT EXISTS starts_on date NULL;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.project_tasks'::regclass
      AND conname = 'project_tasks_starts_on_before_due'
  ) THEN
    ALTER TABLE public.project_tasks
      ADD CONSTRAINT project_tasks_starts_on_before_due
        CHECK (starts_on IS NULL OR due_date IS NULL OR starts_on <= due_date)
        NOT VALID;
  END IF;
END $$;

ALTER TABLE public.project_tasks
  VALIDATE CONSTRAINT project_tasks_starts_on_before_due;

COMMENT ON COLUMN public.project_tasks.starts_on IS
  'Working-window start (Calendar Folio span); due_date is the window end.';
