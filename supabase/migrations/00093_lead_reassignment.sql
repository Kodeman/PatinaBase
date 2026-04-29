-- ============================================================================
-- Migration 00093: Lead reassignment support
--
-- Extends:
--   • client_activity_log.activity_type CHECK → adds 'lead_reassigned'
--   • project_team_members.role CHECK → adds 'previous_lead'
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Expand client_activity_log.activity_type constraint
-- ---------------------------------------------------------------------------
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
    'lead_reassigned'
  ));

-- ---------------------------------------------------------------------------
-- 2. Expand project_team_members.role constraint to include 'previous_lead'
-- ---------------------------------------------------------------------------
ALTER TABLE project_team_members
  DROP CONSTRAINT IF EXISTS project_team_members_role_check;

ALTER TABLE project_team_members
  ADD CONSTRAINT project_team_members_role_check
  CHECK (role IN (
    'lead_designer',
    'support_designer',
    'vendor',
    'client',
    'bookkeeper',
    'previous_lead'
  ));
