CREATE TABLE data_erasure_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  erased_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  requested_by_user_id UUID,
  reason TEXT,
  completed BOOLEAN NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_data_erasure_log_user
  ON data_erasure_log(user_id, erased_at DESC);

ALTER TABLE data_erasure_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY data_erasure_log_admin_read ON data_erasure_log
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM user_roles ur
      JOIN roles r ON r.id = ur.role_id
      WHERE ur.user_id = auth.uid() AND r.domain = 'admin'
    )
  );
