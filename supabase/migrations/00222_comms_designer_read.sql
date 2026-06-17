-- 00222_comms_designer_read.sql
--
-- Additive RLS (D7): let an authenticated designer READ their own + shared comms
-- rows directly via the anon client. `email_templates` (00045) and
-- `audience_segments` (00046) shipped admin-first with ONLY service-role +
-- admin-domain SELECT policies, so the designer-portal People Room Outreach
-- views (useTemplates / useAudienceSegments read direct-client) returned ZERO
-- rows for any non-admin designer.
--
-- These permissive SELECT policies are OR'd with the existing admin/service
-- policies, so admins and the service role are unaffected. WRITES stay routed
-- through the designer-scoped API handlers (service-role + created_by checks);
-- a designer can never see another designer's rows — only their own
-- (created_by = auth.uid()) plus the shared library (system templates with
-- created_by IS NULL / preset segments with is_preset = true).

-- Email templates: own templates + the shared system library.
DROP POLICY IF EXISTS "Designers read own and shared email_templates" ON email_templates;
CREATE POLICY "Designers read own and shared email_templates" ON email_templates
  FOR SELECT TO authenticated
  USING (created_by = auth.uid() OR created_by IS NULL);

-- Audience segments: own segments + the shared presets.
DROP POLICY IF EXISTS "Designers read own and preset audience_segments" ON audience_segments;
CREATE POLICY "Designers read own and preset audience_segments" ON audience_segments
  FOR SELECT TO authenticated
  USING (created_by = auth.uid() OR is_preset = true);
