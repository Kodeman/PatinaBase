-- Sample project_documents + project_tasks (00169) for the seeded
-- "Aspen Loft Refresh" project, so the Active Project detail page renders real
-- documents and phase tasks instead of falling back to mock. Idempotent via
-- fixed UUIDs + ON CONFLICT DO NOTHING. Must run after decisions.sql (which
-- creates the project).
DO $$
DECLARE
  v_project_id UUID := 'b0000000-0000-0000-0000-0000000000d1';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.projects WHERE id = v_project_id) THEN
    RAISE NOTICE 'project_documents_tasks.sql: project % not found, skipping', v_project_id;
    RETURN;
  END IF;

  INSERT INTO public.project_documents
    (id, project_id, title, doc_type, category, size_bytes, version, status, created_at)
  VALUES
    ('d0c00000-0000-0000-0000-000000000001', v_project_id, 'Service Agreement — Aspen Loft', 'pdf',  'contract',  911360, 'v1.0', 'signed',  NOW() - INTERVAL '20 days'),
    ('d0c00000-0000-0000-0000-000000000002', v_project_id, 'Floor Plan — Living & Dining',  'dwg',  'drawing',  1258291, 'v2.0', 'current', NOW() - INTERVAL '10 days'),
    ('d0c00000-0000-0000-0000-000000000003', v_project_id, 'FF&E Specification Schedule',   'xlsx', 'spec',      348160, 'v1.2', 'draft',   NOW() - INTERVAL '3 days')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.project_tasks
    (id, project_id, phase_key, title, status, sort_order, due_date, completed_at)
  VALUES
    ('ba5c0000-0000-0000-0000-000000000001', v_project_id, 'consultation', 'Site measure & existing-conditions photos', 'done', 0, NULL, NOW() - INTERVAL '18 days'),
    ('ba5c0000-0000-0000-0000-000000000002', v_project_id, 'concept',      'Present concept storyboards',               'todo', 1, (NOW() + INTERVAL '7 days')::date,  NULL),
    ('ba5c0000-0000-0000-0000-000000000003', v_project_id, 'concept',      'Finalize material palette',                 'todo', 2, (NOW() + INTERVAL '14 days')::date, NULL)
  ON CONFLICT (id) DO NOTHING;

  RAISE NOTICE 'project_documents_tasks.sql: seeded documents + tasks on project %', v_project_id;
END $$;
