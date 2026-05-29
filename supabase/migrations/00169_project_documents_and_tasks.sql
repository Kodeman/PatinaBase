-- Supabase-first project_documents + project_tasks.
--
-- The designer portal previously read project tasks/documents from the retained
-- svc_projects NestJS service. That service operates on a separate, empty
-- svc_projects.* schema that is never populated for the public projects created
-- by activate_proposal_as_project — so those calls 404'd (wrong proxy prefix)
-- and silently fell back to fabricated mock data. Per the Supabase-first
-- architecture, tasks and documents now live in public tables read directly
-- (like project_rooms / project_ffe_items / project_phases). RLS mirrors
-- project_rooms (designer manages, client + active team member view).

CREATE TABLE IF NOT EXISTS public.project_documents (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  title       text NOT NULL,
  doc_type    text NOT NULL DEFAULT 'pdf',  -- pdf|img|doc|xls|dwg|png|xlsx
  category    text,                          -- contract|drawing|photo|spec
  storage_path text,
  url         text,
  size_bytes  bigint,
  version     text,
  status      text,
  uploaded_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_project_documents_project ON public.project_documents(project_id);

CREATE TABLE IF NOT EXISTS public.project_tasks (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id   uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  phase_key    text,
  title        text NOT NULL,
  description  text,
  status       text NOT NULL DEFAULT 'todo' CHECK (status IN ('todo','done','blocked')),
  due_date     date,
  completed_at timestamptz,
  sort_order   int NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_project_tasks_project ON public.project_tasks(project_id);

CREATE TRIGGER set_project_documents_updated_at BEFORE UPDATE ON public.project_documents
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER set_project_tasks_updated_at BEFORE UPDATE ON public.project_tasks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.project_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_tasks ENABLE ROW LEVEL SECURITY;

-- project_documents RLS
CREATE POLICY "Designers manage their project documents" ON public.project_documents FOR ALL
  USING (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_documents.project_id AND p.designer_id = auth.uid()));
CREATE POLICY "Clients can view their project documents" ON public.project_documents FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_documents.project_id AND p.client_id = auth.uid()));
CREATE POLICY "Team can view their project documents" ON public.project_documents FOR SELECT
  USING (is_project_team_member(project_id));

-- project_tasks RLS
CREATE POLICY "Designers manage their project tasks" ON public.project_tasks FOR ALL
  USING (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_tasks.project_id AND p.designer_id = auth.uid()));
CREATE POLICY "Clients can view their project tasks" ON public.project_tasks FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_tasks.project_id AND p.client_id = auth.uid()));
CREATE POLICY "Team can view their project tasks" ON public.project_tasks FOR SELECT
  USING (is_project_team_member(project_id));
