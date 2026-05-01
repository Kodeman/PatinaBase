-- Migration: 00114_scope_change_client_cancel.sql
-- Allow clients to cancel their own scope-change requests while still in draft/sent state.
-- The original "Clients can approve/decline scope changes" policy (00066) restricts
-- WITH CHECK to ('approved','declined') — adding a self-cancel policy in parallel keeps
-- the approval/decline flow intact.

CREATE POLICY "Clients can cancel their own scope changes"
  ON scope_change_requests FOR UPDATE
  USING (
    requested_by = auth.uid()
    AND status IN ('draft', 'sent', 'viewed')
  )
  WITH CHECK (
    requested_by = auth.uid()
    AND status = 'cancelled'
  );
