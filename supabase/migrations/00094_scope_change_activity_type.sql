-- ============================================================================
-- Migration 00094: Add scope_change_requested to client_activity_log
--
-- Extends:
--   • client_activity_log.activity_type CHECK → adds 'scope_change_requested'
-- ============================================================================

ALTER TABLE client_activity_log
  DROP CONSTRAINT IF EXISTS client_activity_log_activity_type_check;

ALTER TABLE client_activity_log
  ADD CONSTRAINT client_activity_log_activity_type_check
  CHECK (activity_type IN (
    'message',
    'decision',
    'status_change',
    'invoice',
    'project_update',
    'review',
    'note',
    'milestone',
    'lead_reassigned',
    'scope_change_requested'
  ));
