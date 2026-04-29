-- Migration: 00095_projects_completed_at.sql
-- Adds a completed_at timestamp to projects so the review-requests
-- edge function can find projects completed 3+ days ago.
-- The column is NULL until a project transitions to status='completed'.

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS completed_at timestamptz;

-- Back-fill: for any project already in completed status, use updated_at
-- as a conservative estimate of when it was completed.
UPDATE public.projects
   SET completed_at = updated_at
 WHERE status = 'completed'
   AND completed_at IS NULL;

-- Trigger: automatically stamp completed_at when status transitions to 'completed'.
CREATE OR REPLACE FUNCTION public.stamp_project_completed_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'completed' AND (OLD.status IS DISTINCT FROM 'completed') THEN
    NEW.completed_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_stamp_project_completed_at ON public.projects;

CREATE TRIGGER trg_stamp_project_completed_at
  BEFORE UPDATE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.stamp_project_completed_at();

COMMENT ON COLUMN public.projects.completed_at IS
  'Timestamp when the project status transitioned to completed. Used by the review-requests cron to trigger the 3-day review email.';
