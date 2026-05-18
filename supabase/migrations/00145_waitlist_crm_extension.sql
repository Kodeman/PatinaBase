-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: Waitlist CRM Extension
-- Description: Evolve the waitlist surface into a lead qualification CRM.
--   1. Widen waitlist.role to include 'vendor'
--   2. Add qualification stage, ownership, profile, contact-cadence columns
--   3. Backfill qualification_stage from existing converted_at
--   4. Introduce waitlist_activities (typed timeline) and waitlist_tasks
--   5. Trigger that auto-logs stage_changed / assigned / converted activities
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. Widen role CHECK to allow 'vendor' ────────────────────────────────
ALTER TABLE waitlist DROP CONSTRAINT IF EXISTS waitlist_role_check;
ALTER TABLE waitlist ADD CONSTRAINT waitlist_role_check
  CHECK (role IN ('designer', 'consumer', 'vendor', 'unknown'));

-- ─── 2. New columns ───────────────────────────────────────────────────────
ALTER TABLE waitlist
  ADD COLUMN IF NOT EXISTS qualification_stage TEXT NOT NULL DEFAULT 'new',
  ADD COLUMN IF NOT EXISTS assigned_admin_id   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS full_name           TEXT,
  ADD COLUMN IF NOT EXISTS company_name        TEXT,
  ADD COLUMN IF NOT EXISTS phone               TEXT,
  ADD COLUMN IF NOT EXISTS notes               TEXT,
  ADD COLUMN IF NOT EXISTS last_contacted_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS next_follow_up_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS disqualified_reason TEXT;

ALTER TABLE waitlist DROP CONSTRAINT IF EXISTS waitlist_qualification_stage_check;
ALTER TABLE waitlist ADD CONSTRAINT waitlist_qualification_stage_check
  CHECK (qualification_stage IN ('new', 'contacted', 'qualified', 'nurture', 'converted', 'disqualified'));

-- Backfill stage from existing converted_at
UPDATE waitlist
SET qualification_stage = 'converted'
WHERE converted_at IS NOT NULL
  AND qualification_stage = 'new';

CREATE INDEX IF NOT EXISTS idx_waitlist_qualification_stage ON waitlist(qualification_stage);
CREATE INDEX IF NOT EXISTS idx_waitlist_assigned_admin      ON waitlist(assigned_admin_id);
CREATE INDEX IF NOT EXISTS idx_waitlist_next_follow_up      ON waitlist(next_follow_up_at)
  WHERE next_follow_up_at IS NOT NULL;

-- ─── 3. waitlist_activities (typed timeline) ──────────────────────────────
CREATE TABLE IF NOT EXISTS waitlist_activities (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  waitlist_id     UUID NOT NULL REFERENCES waitlist(id) ON DELETE CASCADE,
  actor_admin_id  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  kind            TEXT NOT NULL,
  body            TEXT,
  metadata        JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE waitlist_activities DROP CONSTRAINT IF EXISTS waitlist_activities_kind_check;
ALTER TABLE waitlist_activities ADD CONSTRAINT waitlist_activities_kind_check
  CHECK (kind IN (
    'note', 'email_sent', 'call_logged',
    'stage_changed', 'assigned', 'contacted',
    'qualified', 'disqualified', 'converted',
    'task_created', 'task_completed'
  ));

CREATE INDEX IF NOT EXISTS idx_waitlist_activities_waitlist
  ON waitlist_activities(waitlist_id, created_at DESC);

ALTER TABLE waitlist_activities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage waitlist activities" ON waitlist_activities
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM user_roles ur
      JOIN roles r ON ur.role_id = r.id
      WHERE ur.user_id = auth.uid()
      AND r.domain = 'admin'
    )
  );

-- ─── 4. waitlist_tasks (follow-up tasks) ──────────────────────────────────
CREATE TABLE IF NOT EXISTS waitlist_tasks (
  id                 UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  waitlist_id        UUID NOT NULL REFERENCES waitlist(id) ON DELETE CASCADE,
  assigned_admin_id  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by         UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  title              TEXT NOT NULL,
  due_date           TIMESTAMPTZ,
  completed_at       TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_waitlist_tasks_waitlist
  ON waitlist_tasks(waitlist_id, completed_at, due_date);
CREATE INDEX IF NOT EXISTS idx_waitlist_tasks_assigned
  ON waitlist_tasks(assigned_admin_id)
  WHERE completed_at IS NULL;

ALTER TABLE waitlist_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage waitlist tasks" ON waitlist_tasks
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM user_roles ur
      JOIN roles r ON ur.role_id = r.id
      WHERE ur.user_id = auth.uid()
      AND r.domain = 'admin'
    )
  );

CREATE TRIGGER update_waitlist_tasks_updated_at
  BEFORE UPDATE ON waitlist_tasks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Note: Activity rows are written explicitly by the admin API alongside
-- waitlist UPDATEs. The admin routes use the service role and bypass
-- auth.uid(), so an AFTER UPDATE trigger cannot capture the actor reliably.
-- Direct SQL UPDATEs will therefore not log activities — that is acceptable
-- since the admin UI is the only sanctioned writer.

-- ─── 5. Extend handle_new_user() to also flip qualification_stage ─────────
-- The existing trigger (00040) marks waitlist rows as converted when an
-- auth.user with the same email is created. Stamp the stage too so the
-- admin list shows the converted lane without a manual second write.
UPDATE waitlist
SET qualification_stage = 'converted'
WHERE converted_at IS NOT NULL AND qualification_stage <> 'converted';

CREATE OR REPLACE FUNCTION public.mark_waitlist_converted()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.converted_at IS NOT NULL
     AND (OLD.converted_at IS NULL OR OLD.qualification_stage <> 'converted')
     AND NEW.qualification_stage <> 'converted' THEN
    NEW.qualification_stage := 'converted';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS mark_waitlist_converted_trigger ON waitlist;
CREATE TRIGGER mark_waitlist_converted_trigger
  BEFORE UPDATE ON waitlist
  FOR EACH ROW EXECUTE FUNCTION public.mark_waitlist_converted();
