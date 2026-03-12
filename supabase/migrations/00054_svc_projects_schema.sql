-- Migration: Create projects service schema
-- Source: services/projects/prisma/schema.prisma

BEGIN;

CREATE SCHEMA IF NOT EXISTS svc_projects;
SET search_path TO svc_projects;

-- Projects
CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id TEXT,
  title TEXT NOT NULL,
  client_id TEXT NOT NULL,
  designer_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  start_date TIMESTAMPTZ,
  end_date TIMESTAMPTZ,
  actual_end TIMESTAMPTZ,
  budget DECIMAL(12,2),
  currency TEXT NOT NULL DEFAULT 'USD',
  description TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_projects_client ON projects(client_id, status);
CREATE INDEX IF NOT EXISTS idx_projects_designer ON projects(designer_id, status);
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status, start_date);

-- Tasks
CREATE TABLE IF NOT EXISTS tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  assignee_id TEXT,
  due_date TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'todo',
  priority TEXT NOT NULL DEFAULT 'medium',
  "order" INT NOT NULL DEFAULT 0,
  completed_at TIMESTAMPTZ,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id, status);
CREATE INDEX IF NOT EXISTS idx_tasks_assignee ON tasks(assignee_id, status);
CREATE INDEX IF NOT EXISTS idx_tasks_due ON tasks(due_date);

-- RFIs (Requests for Information)
CREATE TABLE IF NOT EXISTS rfis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  question TEXT NOT NULL,
  answer TEXT,
  requested_by TEXT NOT NULL,
  assigned_to TEXT,
  due_date TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'open',
  priority TEXT NOT NULL DEFAULT 'normal',
  answered_at TIMESTAMPTZ,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_rfis_project ON rfis(project_id, status);
CREATE INDEX IF NOT EXISTS idx_rfis_assigned ON rfis(assigned_to, status);

-- Change Orders
CREATE TABLE IF NOT EXISTS change_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  requested_by TEXT NOT NULL,
  cost_impact DECIMAL(12,2),
  schedule_impact INT,
  status TEXT NOT NULL DEFAULT 'draft',
  reason TEXT,
  approved_by TEXT,
  approved_at TIMESTAMPTZ,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_co_project ON change_orders(project_id, status);
CREATE INDEX IF NOT EXISTS idx_co_status ON change_orders(status, created_at);

-- Issues
CREATE TABLE IF NOT EXISTS issues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  reported_by TEXT NOT NULL,
  assigned_to TEXT,
  severity TEXT NOT NULL DEFAULT 'medium',
  status TEXT NOT NULL DEFAULT 'open',
  resolution TEXT,
  resolved_at TIMESTAMPTZ,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_issues_project ON issues(project_id, status);
CREATE INDEX IF NOT EXISTS idx_issues_assigned ON issues(assigned_to, status);
CREATE INDEX IF NOT EXISTS idx_issues_severity ON issues(severity, status);

-- Daily Logs
CREATE TABLE IF NOT EXISTS daily_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  author_id TEXT NOT NULL,
  date DATE NOT NULL,
  notes TEXT,
  weather TEXT,
  photos JSONB,
  attendees JSONB,
  activities JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(project_id, date)
);
CREATE INDEX IF NOT EXISTS idx_logs_project ON daily_logs(project_id, date);
CREATE INDEX IF NOT EXISTS idx_logs_author ON daily_logs(author_id);

-- Documents
CREATE TABLE IF NOT EXISTS documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  key TEXT NOT NULL,
  category TEXT NOT NULL,
  version INT NOT NULL DEFAULT 1,
  size INT,
  mime_type TEXT,
  uploaded_by TEXT NOT NULL,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_docs_project ON documents(project_id, category);
CREATE INDEX IF NOT EXISTS idx_docs_uploader ON documents(uploaded_by);

-- Milestones
CREATE TABLE IF NOT EXISTS milestones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  target_date TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'pending',
  "order" INT NOT NULL DEFAULT 0,
  media JSONB,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_milestones_project ON milestones(project_id, "order");
CREATE INDEX IF NOT EXISTS idx_milestones_target ON milestones(target_date);

-- Project Updates
CREATE TABLE IF NOT EXISTS project_updates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  author_id TEXT NOT NULL,
  media JSONB,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_updates_project ON project_updates(project_id, created_at);
CREATE INDEX IF NOT EXISTS idx_updates_author ON project_updates(author_id);

-- Timeline Segments (Client Portal)
CREATE TABLE IF NOT EXISTS timeline_segments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  phase TEXT NOT NULL,
  start_date TIMESTAMPTZ NOT NULL,
  end_date TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  progress INT NOT NULL DEFAULT 0,
  dependencies JSONB,
  deliverables JSONB,
  "order" INT NOT NULL DEFAULT 0,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_segments_project ON timeline_segments(project_id, "order");
CREATE INDEX IF NOT EXISTS idx_segments_phase ON timeline_segments(phase, status);
CREATE INDEX IF NOT EXISTS idx_segments_dates ON timeline_segments(start_date, end_date);

-- Client Activities
CREATE TABLE IF NOT EXISTS client_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  segment_id UUID REFERENCES timeline_segments(id) ON DELETE SET NULL,
  user_id TEXT NOT NULL,
  activity_type TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  duration INT,
  metadata JSONB,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_activity_project ON client_activities(project_id, user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_activity_user ON client_activities(user_id, activity_type);
CREATE INDEX IF NOT EXISTS idx_activity_segment ON client_activities(segment_id, activity_type);
CREATE INDEX IF NOT EXISTS idx_activity_created ON client_activities(created_at);

-- Approval Records
CREATE TABLE IF NOT EXISTS approval_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  segment_id UUID REFERENCES timeline_segments(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  approval_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  priority TEXT NOT NULL DEFAULT 'normal',
  requested_by TEXT NOT NULL,
  assigned_to TEXT NOT NULL,
  due_date TIMESTAMPTZ,
  approved_at TIMESTAMPTZ,
  approved_by TEXT,
  rejected_at TIMESTAMPTZ,
  rejected_by TEXT,
  rejection_reason TEXT,
  documents JSONB,
  comments JSONB,
  signature JSONB,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_approval_project ON approval_records(project_id, status);
CREATE INDEX IF NOT EXISTS idx_approval_assigned ON approval_records(assigned_to, status, due_date);
CREATE INDEX IF NOT EXISTS idx_approval_type ON approval_records(approval_type, status);
CREATE INDEX IF NOT EXISTS idx_approval_created ON approval_records(created_at);

-- Engagement Metrics
CREATE TABLE IF NOT EXISTS engagement_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID UNIQUE NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  client_id TEXT NOT NULL,
  total_views INT NOT NULL DEFAULT 0,
  total_time_spent INT NOT NULL DEFAULT 0,
  last_activity TIMESTAMPTZ,
  approval_velocity DOUBLE PRECISION,
  response_rate DOUBLE PRECISION,
  satisfaction_score DOUBLE PRECISION,
  comments_count INT NOT NULL DEFAULT 0,
  approvals_count INT NOT NULL DEFAULT 0,
  rejections_count INT NOT NULL DEFAULT 0,
  documents_viewed INT NOT NULL DEFAULT 0,
  documents_downloaded INT NOT NULL DEFAULT 0,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_engagement_client ON engagement_metrics(client_id);
CREATE INDEX IF NOT EXISTS idx_engagement_activity ON engagement_metrics(last_activity);

-- Notification Preferences
CREATE TABLE IF NOT EXISTS notification_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT UNIQUE NOT NULL,
  email BOOLEAN NOT NULL DEFAULT TRUE,
  email_address TEXT,
  sms BOOLEAN NOT NULL DEFAULT FALSE,
  phone_number TEXT,
  push BOOLEAN NOT NULL DEFAULT TRUE,
  push_tokens JSONB,
  channels JSONB,
  frequency TEXT NOT NULL DEFAULT 'immediate',
  quiet_hours JSONB,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Notifications
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  type TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'normal',
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  action_url TEXT,
  channels JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  sent_at TIMESTAMPTZ,
  read_at TIMESTAMPTZ,
  delivery_status JSONB,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(user_id, status, created_at);
CREATE INDEX IF NOT EXISTS idx_notif_project ON notifications(project_id, type);
CREATE INDEX IF NOT EXISTS idx_notif_status ON notifications(status, created_at);

-- Active WebSocket Connections
CREATE TABLE IF NOT EXISTS active_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  socket_id TEXT UNIQUE NOT NULL,
  user_agent TEXT,
  ip_address TEXT,
  connected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_ping_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB
);
CREATE INDEX IF NOT EXISTS idx_conn_user ON active_connections(user_id);
CREATE INDEX IF NOT EXISTS idx_conn_project ON active_connections(project_id);
CREATE INDEX IF NOT EXISTS idx_conn_ping ON active_connections(last_ping_at);

-- Queued Messages (for offline clients)
CREATE TABLE IF NOT EXISTS queued_messages (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  event TEXT NOT NULL,
  payload JSONB NOT NULL,
  project_id TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_queue_user ON queued_messages(user_id, expires_at);
CREATE INDEX IF NOT EXISTS idx_queue_expires ON queued_messages(expires_at);

-- Audit Logs
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  action TEXT NOT NULL,
  actor TEXT,
  changes JSONB,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at);

-- Outbox Events
CREATE TABLE IF NOT EXISTS outbox_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL,
  payload JSONB NOT NULL,
  headers JSONB,
  published BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  published_at TIMESTAMPTZ,
  retry_count INT NOT NULL DEFAULT 0,
  last_error TEXT
);
CREATE INDEX IF NOT EXISTS idx_outbox_type_published ON outbox_events(type, published);
CREATE INDEX IF NOT EXISTS idx_outbox_created ON outbox_events(created_at);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION svc_projects.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOR tbl IN SELECT unnest(ARRAY[
    'projects', 'tasks', 'rfis', 'change_orders', 'issues', 'daily_logs',
    'documents', 'milestones', 'project_updates', 'timeline_segments',
    'approval_records', 'engagement_metrics', 'notification_preferences', 'notifications'
  ])
  LOOP
    EXECUTE format('CREATE TRIGGER set_updated_at BEFORE UPDATE ON svc_projects.%I FOR EACH ROW EXECUTE FUNCTION svc_projects.set_updated_at()', tbl);
  END LOOP;
END $$;

COMMIT;

RESET search_path;
