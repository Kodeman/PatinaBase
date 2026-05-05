-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: Email template versioning
-- Description: Snapshots the previous content of an email_templates row on
--   every UPDATE that touches content_blocks, html_content, variables, or
--   subject_default. Lets admins inspect history and restore an old version.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS email_template_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES email_templates(id) ON DELETE CASCADE,
  version_num INTEGER NOT NULL,
  content_blocks JSONB,
  html_content TEXT,
  variables JSONB,
  subject_default TEXT,
  name TEXT,
  edited_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (template_id, version_num)
);

CREATE INDEX IF NOT EXISTS idx_email_template_versions_template
  ON email_template_versions(template_id, version_num DESC);

-- Snapshot trigger: fires BEFORE UPDATE on email_templates. Copies the OLD
-- row into email_template_versions when content materially changed. The
-- version_num is monotonic per template.
CREATE OR REPLACE FUNCTION snapshot_email_template()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  next_version INTEGER;
  changed BOOLEAN;
BEGIN
  changed :=
    OLD.content_blocks IS DISTINCT FROM NEW.content_blocks
    OR OLD.html_content IS DISTINCT FROM NEW.html_content
    OR OLD.variables IS DISTINCT FROM NEW.variables
    OR OLD.subject_default IS DISTINCT FROM NEW.subject_default
    OR OLD.name IS DISTINCT FROM NEW.name;

  IF NOT changed THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(MAX(version_num), 0) + 1
  INTO next_version
  FROM email_template_versions
  WHERE template_id = OLD.id;

  INSERT INTO email_template_versions (
    template_id, version_num, content_blocks, html_content,
    variables, subject_default, name, edited_by
  )
  VALUES (
    OLD.id, next_version, OLD.content_blocks, OLD.html_content,
    OLD.variables, OLD.subject_default, OLD.name,
    -- created_by isn't necessarily the editor; capture auth.uid() if available.
    (CASE WHEN auth.uid() IS NOT NULL THEN auth.uid() ELSE NULL END)
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_snapshot_email_template ON email_templates;
CREATE TRIGGER trg_snapshot_email_template
  BEFORE UPDATE ON email_templates
  FOR EACH ROW
  EXECUTE FUNCTION snapshot_email_template();

ALTER TABLE email_template_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY email_template_versions_admin_read ON email_template_versions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM user_roles ur
      JOIN roles r ON r.id = ur.role_id
      WHERE ur.user_id = auth.uid() AND r.domain = 'admin'
    )
  );
