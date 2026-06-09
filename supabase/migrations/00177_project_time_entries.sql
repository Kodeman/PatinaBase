-- Time-tracking foundations (Wave 1).
--
-- public.project_time_entries holds both manual entries and (later) running
-- timers: duration_minutes IS NULL = a running timer (one per user, enforced
-- by a partial unique index); a completed entry has duration_minutes > 0.
-- invoice_id has NO FK yet — the invoices migration (00178) adds it. Once an
-- entry is invoiced its priced/attributable columns are locked by trigger
-- (notes stay editable, and the entry can be detached by nulling invoice_id).
--
-- Rate resolution for billing (see project_unbilled_time):
--   entry snapshot → project change-order hourly rate → profile default → 0.

CREATE TABLE IF NOT EXISTS public.project_time_entries (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id        uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  phase_key         text,                  -- canonical PhaseSlug, nullable like project_tasks.phase_key
  task_id           uuid REFERENCES public.project_tasks(id) ON DELETE SET NULL,
  user_id           uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  started_at        timestamptz NOT NULL DEFAULT now(),
  duration_minutes  integer CHECK (duration_minutes IS NULL OR duration_minutes > 0),  -- NULL = running timer
  notes             text,
  billable          boolean NOT NULL DEFAULT true,
  hourly_rate_cents integer,               -- snapshot at stop/create
  invoice_id        uuid,                  -- NO FK yet; the invoices migration (00178) adds it
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_project_time_entries_project_started
  ON public.project_time_entries(project_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_project_time_entries_user_started
  ON public.project_time_entries(user_id, started_at DESC);
-- Unbilled rollups: completed billable entries not yet attached to an invoice.
CREATE INDEX IF NOT EXISTS idx_project_time_entries_unbilled
  ON public.project_time_entries(project_id)
  WHERE invoice_id IS NULL AND billable AND duration_minutes IS NOT NULL;
-- One running timer per user (timer hooks ship in a later wave; the table
-- supports them from day one).
CREATE UNIQUE INDEX IF NOT EXISTS uniq_project_time_entries_running_timer
  ON public.project_time_entries(user_id)
  WHERE duration_minutes IS NULL;

DROP TRIGGER IF EXISTS set_project_time_entries_updated_at ON public.project_time_entries;
CREATE TRIGGER set_project_time_entries_updated_at BEFORE UPDATE ON public.project_time_entries
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ── Invoiced-entry lock ──
-- Once invoiced: DELETE is forbidden; UPDATE may only touch notes and
-- invoice_id itself (detach allowed) — any priced/attributable column change
-- raises.
CREATE OR REPLACE FUNCTION public.guard_invoiced_time_entry()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.invoice_id IS NOT NULL THEN
      RAISE EXCEPTION 'Time entry % is attached to invoice % and cannot be deleted. Detach it from the invoice first.',
        OLD.id, OLD.invoice_id;
    END IF;
    RETURN OLD;
  END IF;

  IF OLD.invoice_id IS NOT NULL AND (
       NEW.project_id        IS DISTINCT FROM OLD.project_id
    OR NEW.phase_key         IS DISTINCT FROM OLD.phase_key
    OR NEW.task_id           IS DISTINCT FROM OLD.task_id
    OR NEW.user_id           IS DISTINCT FROM OLD.user_id
    OR NEW.started_at        IS DISTINCT FROM OLD.started_at
    OR NEW.duration_minutes  IS DISTINCT FROM OLD.duration_minutes
    OR NEW.billable          IS DISTINCT FROM OLD.billable
    OR NEW.hourly_rate_cents IS DISTINCT FROM OLD.hourly_rate_cents
  ) THEN
    RAISE EXCEPTION 'Time entry % is attached to invoice %; only notes (and detaching the invoice) may change.',
      OLD.id, OLD.invoice_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_invoiced_time_entry ON public.project_time_entries;
CREATE TRIGGER guard_invoiced_time_entry
  BEFORE UPDATE OR DELETE ON public.project_time_entries
  FOR EACH ROW EXECUTE FUNCTION public.guard_invoiced_time_entry();

-- ── Phase estimates + designer default rate ──

ALTER TABLE public.project_phases ADD COLUMN IF NOT EXISTS estimated_hours numeric(6,1);
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS default_hourly_rate_cents integer;

-- ── Unbilled time view ──
-- Completed, billable, un-invoiced entries with the resolved rate + amount.
-- projects.change_order_terms is the JSONB written by activate_proposal_as_project
-- (00167: { process_description, hourly_rate_cents, minimum_fee_cents,
-- approval_required }) — hourly_rate_cents is the project-level hourly rate.
-- security_invoker so RLS on project_time_entries/projects applies to the caller.
CREATE OR REPLACE VIEW public.project_unbilled_time
WITH (security_invoker = true) AS
SELECT
  te.id,
  te.project_id,
  te.phase_key,
  te.task_id,
  te.user_id,
  te.started_at,
  te.duration_minutes,
  te.notes,
  COALESCE(
    te.hourly_rate_cents,
    NULLIF((p.change_order_terms->>'hourly_rate_cents')::int, 0),
    pr.default_hourly_rate_cents,
    0
  ) AS resolved_rate_cents,
  ROUND(
    (te.duration_minutes / 60.0) * COALESCE(
      te.hourly_rate_cents,
      NULLIF((p.change_order_terms->>'hourly_rate_cents')::int, 0),
      pr.default_hourly_rate_cents,
      0
    )
  )::int AS amount_cents
FROM public.project_time_entries te
JOIN public.projects p ON p.id = te.project_id
JOIN public.profiles pr ON pr.id = te.user_id
WHERE te.invoice_id IS NULL
  AND te.billable
  AND te.duration_minutes IS NOT NULL;

-- ── RLS ──
-- Designers manage everything on their projects; team members view all project
-- entries and manage only their own rows. NO client policies — time is internal.

ALTER TABLE public.project_time_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Designers manage their project time entries" ON public.project_time_entries;
CREATE POLICY "Designers manage their project time entries" ON public.project_time_entries FOR ALL
  USING (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_time_entries.project_id AND p.designer_id = auth.uid()));

DROP POLICY IF EXISTS "Team can view their project time entries" ON public.project_time_entries;
CREATE POLICY "Team can view their project time entries" ON public.project_time_entries FOR SELECT
  USING (is_project_team_member(project_id));

DROP POLICY IF EXISTS "Team can log their own time entries" ON public.project_time_entries;
CREATE POLICY "Team can log their own time entries" ON public.project_time_entries FOR INSERT
  WITH CHECK (user_id = auth.uid() AND is_project_team_member(project_id));

DROP POLICY IF EXISTS "Team can update their own time entries" ON public.project_time_entries;
CREATE POLICY "Team can update their own time entries" ON public.project_time_entries FOR UPDATE
  USING (user_id = auth.uid() AND is_project_team_member(project_id));

DROP POLICY IF EXISTS "Team can delete their own time entries" ON public.project_time_entries;
CREATE POLICY "Team can delete their own time entries" ON public.project_time_entries FOR DELETE
  USING (user_id = auth.uid() AND is_project_team_member(project_id));
