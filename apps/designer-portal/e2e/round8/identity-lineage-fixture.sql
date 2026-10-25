-- F02/F03 fictional lineage snapshots, owned by SQ-1974. No signature is fabricated.
-- Uses the round8 runner's fictional F01 designer, never a real studio actor.
BEGIN;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public.leads WHERE id::text LIKE 'f2740000-%')
     OR EXISTS (SELECT 1 FROM public.projects WHERE id::text LIKE 'f2740000-%')
     OR EXISTS (SELECT 1 FROM public.proposals WHERE id::text LIKE 'f2740000-%')
     OR EXISTS (SELECT 1 FROM public.designer_clients WHERE id::text LIKE 'f2740000-%') THEN
    RAISE EXCEPTION 'SQ-1974 fixture residue: refusing to overwrite';
  END IF;
END $$;
INSERT INTO public.leads (id, designer_id, project_type, status, contact_name, project_description) VALUES
 ('f2740000-0000-4000-8000-000000000010', 'f0180000-0000-4000-8000-000000000002', 'living_room', 'new', 'F02 Fictional Inquiry', 'F02 original inquiry: keep the piano.'),
 ('f2740000-0000-4000-8000-000000000011', 'f0180000-0000-4000-8000-000000000002', 'living_room', 'accepted', 'F02 Fictional Commission', 'F02 original accepted inquiry: keep the piano.');
INSERT INTO public.designer_clients (id, designer_id, client_name, status, lead_id) VALUES
 ('f2740000-0000-4000-8000-000000000012', 'f0180000-0000-4000-8000-000000000002', 'F02 Fictional Commission', 'active', 'f2740000-0000-4000-8000-000000000011'),
 ('f2740000-0000-4000-8000-000000000022', 'f0180000-0000-4000-8000-000000000002', 'F02 Fictional Revision', 'proposal', NULL);
INSERT INTO public.proposals (id, designer_id, title, status, designer_client_id, version, parent_proposal_id) VALUES
 ('f2740000-0000-4000-8000-000000000013', 'f0180000-0000-4000-8000-000000000002', 'F02 Fictional Commission', 'accepted', 'f2740000-0000-4000-8000-000000000012', 1, NULL),
 ('f2740000-0000-4000-8000-000000000023', 'f0180000-0000-4000-8000-000000000002', 'F02 Fictional Revision', 'revised', 'f2740000-0000-4000-8000-000000000022', 1, NULL),
 ('f2740000-0000-4000-8000-000000000024', 'f0180000-0000-4000-8000-000000000002', 'F02 Fictional Revision', 'draft', 'f2740000-0000-4000-8000-000000000022', 2, 'f2740000-0000-4000-8000-000000000023');
-- Native document_open_test.sql activation provenance seam. This is an imported
-- legacy accepted proposal snapshot, NOT a sign_proposal/signature flow test.
SELECT set_config('app.proposal_activation_id', 'f2740000-0000-4000-8000-000000000013', true);
INSERT INTO public.projects (id, name, created_by, designer_id, studio_id, status, proposal_id) VALUES
 ('f2740000-0000-4000-8000-000000000015', 'F02 Fictional Commission', 'f0180000-0000-4000-8000-000000000002', 'f0180000-0000-4000-8000-000000000002', 'f0180000-0000-4000-8000-000000000001', 'active', 'f2740000-0000-4000-8000-000000000013');
UPDATE public.proposals SET project_id = 'f2740000-0000-4000-8000-000000000015' WHERE id = 'f2740000-0000-4000-8000-000000000013';
INSERT INTO public.projects (id, name, created_by, designer_id, studio_id, status) VALUES
 ('f2740000-0000-4000-8000-000000000016', 'F03 Fictional Direct Project', 'f0180000-0000-4000-8000-000000000002', 'f0180000-0000-4000-8000-000000000002', 'f0180000-0000-4000-8000-000000000001', 'active');
-- A separate unactivated chain exercises pre-work root/revision aliases.
INSERT INTO public.designer_clients (id, designer_id, client_name, status) VALUES
 ('f2740000-0000-4000-8000-000000000032', 'f0180000-0000-4000-8000-000000000002', 'F02 Fictional Pre-work Revision', 'proposal');
INSERT INTO public.proposals (id, designer_id, title, status, designer_client_id, version, parent_proposal_id) VALUES
 ('f2740000-0000-4000-8000-000000000033', 'f0180000-0000-4000-8000-000000000002', 'F02 Fictional Pre-work Revision', 'revised', 'f2740000-0000-4000-8000-000000000032', 1, NULL),
 ('f2740000-0000-4000-8000-000000000034', 'f0180000-0000-4000-8000-000000000002', 'F02 Fictional Pre-work Revision', 'draft', 'f2740000-0000-4000-8000-000000000032', 2, 'f2740000-0000-4000-8000-000000000033');
-- Import a legacy revised agreement for the mounted project chapter.
-- Post-activation stale-root resolution is covered separately by SQ-2006.
SET LOCAL session_replication_role = replica;
UPDATE public.proposals SET status = 'accepted', description = 'F02 revised agreement: preserve the piano alcove.'
  WHERE id = 'f2740000-0000-4000-8000-000000000024';
UPDATE public.proposals SET description = 'F02 original agreement: retain the piano.'
  WHERE id = 'f2740000-0000-4000-8000-000000000013';
SET LOCAL session_replication_role = origin;
SELECT set_config('app.proposal_activation_id', 'f2740000-0000-4000-8000-000000000024', true);
INSERT INTO public.projects (id, name, created_by, designer_id, studio_id, status, proposal_id) VALUES
 ('f2740000-0000-4000-8000-000000000017', 'F02 Fictional Revision', 'f0180000-0000-4000-8000-000000000002', 'f0180000-0000-4000-8000-000000000002', 'f0180000-0000-4000-8000-000000000001', 'active', 'f2740000-0000-4000-8000-000000000024');
UPDATE public.proposals SET project_id = 'f2740000-0000-4000-8000-000000000017'
  WHERE id = 'f2740000-0000-4000-8000-000000000024';
COMMIT;
