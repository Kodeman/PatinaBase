-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: DSR approval audit columns
-- Description: Adds approved_at, approved_by, notes to data_export_requests
--              and account_deletion_requests so the admin DSR queue can
--              record manual triage decisions. v1 of the DSR queue marks
--              approval only — actual export generation / scheduled deletion
--              is handled by an out-of-band worker (not in this migration).
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.data_export_requests
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS notes text;

ALTER TABLE public.account_deletion_requests
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS notes text;

CREATE INDEX IF NOT EXISTS idx_data_export_requests_approved
  ON public.data_export_requests(approved_at)
  WHERE approved_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_account_deletion_requests_approved
  ON public.account_deletion_requests(approved_at)
  WHERE approved_at IS NOT NULL;

COMMENT ON COLUMN public.data_export_requests.approved_at IS
  'Set by admin via /api/admin/privacy/exports PATCH. Approval gates downstream worker, not deletion itself.';

COMMENT ON COLUMN public.account_deletion_requests.approved_at IS
  'Set by admin via /api/admin/privacy/deletions PATCH. Approval is required before scheduled deletion runs.';
