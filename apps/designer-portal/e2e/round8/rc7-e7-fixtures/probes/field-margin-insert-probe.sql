-- RC7-E7: Field's margin_notes insert shape (CaptureKit MarginNoteWriteRequest
-- CodingKeys: id, body, project_id, designer_id, anchor_kind, field_capture_id)
-- against 00874/00877 typed subjects, as the signed-in designer. Rolled back.
\set ON_ERROR_STOP 1
SELECT current_setting('port') AS port, (SELECT system_identifier FROM pg_control_system()) AS sysid;
BEGIN;
SET LOCAL session_replication_role=replica;
INSERT INTO public.field_captures(id,client_capture_id,designer_id,project_id)
VALUES ('e7e7f000-0000-4000-8000-000000000001','e7e7f200-0000-4000-8000-000000000001','e7e70000-0000-4000-8000-000000000001',
  (SELECT (value->>'projectId')::uuid FROM public.rc7_e7_fixture_results WHERE key='origin1'));
SET LOCAL session_replication_role=origin;
SELECT set_config('request.jwt.claims','{"sub":"e7e70000-0000-4000-8000-000000000001","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
INSERT INTO public.margin_notes(id,body,project_id,designer_id,anchor_kind,field_capture_id)
VALUES ('e7e7f100-0000-4000-8000-000000000001','Field note: confirm island overhang',
  (SELECT f.project_id FROM public.field_captures f WHERE f.id='e7e7f000-0000-4000-8000-000000000001'),
  'e7e70000-0000-4000-8000-000000000001','letterhead','e7e7f000-0000-4000-8000-000000000001')
RETURNING id, subject_kind, subject_id, anchor_kind;
SELECT count(*) AS readable_by_designer FROM public.margin_notes WHERE id='e7e7f100-0000-4000-8000-000000000001';
ROLLBACK;
