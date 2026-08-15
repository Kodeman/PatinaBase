-- ═══════════════════════════════════════════════════════════════════════════
-- Plan Room schema/RLS/RPC/security lifecycle (00429)
--
-- Run:
--   scripts/run-supabase-sql-test.sh supabase/tests/plan_room/security_and_lifecycle_test.sql
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

SET LOCAL statement_timeout = '120s';

INSERT INTO auth.users (
  id, email, encrypted_password, email_confirmed_at, created_at, updated_at,
  instance_id, aud, role
)
VALUES
  ('6a000000-0000-4000-8000-000000000001', 'plan-owner@test.invalid', '', now(), now(), now(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('6a000000-0000-4000-8000-000000000002', 'plan-outsider@test.invalid', '', now(), now(), now(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('6a000000-0000-4000-8000-000000000003', 'plan-client@test.invalid', '', now(), now(), now(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

INSERT INTO public.profiles (id, email, full_name, created_at, updated_at)
VALUES
  ('6a000000-0000-4000-8000-000000000001', 'plan-owner@test.invalid', 'Plan Owner', now(), now()),
  ('6a000000-0000-4000-8000-000000000002', 'plan-outsider@test.invalid', 'Plan Outsider', now(), now()),
  ('6a000000-0000-4000-8000-000000000003', 'plan-client@test.invalid', 'Plan Client', now(), now())
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name;

INSERT INTO public.projects (id, name, designer_id, client_id, created_by)
VALUES
  ('6a000000-0000-4000-8000-000000000101', 'Ashford Residence', '6a000000-0000-4000-8000-000000000001', '6a000000-0000-4000-8000-000000000003', '6a000000-0000-4000-8000-000000000001'),
  ('6a000000-0000-4000-8000-000000000102', 'Foreign Project', '6a000000-0000-4000-8000-000000000002', NULL, '6a000000-0000-4000-8000-000000000002');

INSERT INTO public.project_parties (
  id, project_id, party_kind, display_name, company_name, email, created_by
)
VALUES (
  '6a000000-0000-4000-8000-000000000301',
  '6a000000-0000-4000-8000-000000000101',
  'sub', 'Hollis Bright', 'Hollis Millwork', 'hollis@test.invalid',
  '6a000000-0000-4000-8000-000000000001'
);

-- The uploads a filing is allowed to name. file_plan_prints refuses any path
-- with no object behind it, so these rows are a precondition, not decoration.
INSERT INTO storage.objects (bucket_id, name, owner)
VALUES
  ('project-documents', '6a000000-0000-4000-8000-000000000101/plans/a101-a.pdf', '6a000000-0000-4000-8000-000000000001'),
  ('project-documents', '6a000000-0000-4000-8000-000000000101/plans/a102-a.pdf', '6a000000-0000-4000-8000-000000000001'),
  ('project-documents', '6a000000-0000-4000-8000-000000000101/plans/a101-b.pdf', '6a000000-0000-4000-8000-000000000001'),
  ('project-documents', '6a000000-0000-4000-8000-000000000101/plans/a101-c.pdf', '6a000000-0000-4000-8000-000000000001'),
  ('project-documents', '6a000000-0000-4000-8000-000000000101/plans/a102-b.pdf', '6a000000-0000-4000-8000-000000000001'),
  ('project-documents', '6a000000-0000-4000-8000-000000000101/plans/a101-d.pdf', '6a000000-0000-4000-8000-000000000001'),
  ('project-documents', '6a000000-0000-4000-8000-000000000101/plans/mismatch.pdf', '6a000000-0000-4000-8000-000000000001'),
  ('project-documents', '6a000000-0000-4000-8000-000000000101/plans/unused.pdf', '6a000000-0000-4000-8000-000000000001');

CREATE OR REPLACE FUNCTION pg_temp.assume_user(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', p_user_id::text, 'role', 'authenticated')::text,
    true
  );
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.assume_user_role(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', p_user_id::text, 'role', 'authenticated')::text,
    true
  );
  EXECUTE 'SET LOCAL ROLE authenticated';
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.reset_user_role()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', NULL, true);
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- ACLs, helper contracts, and groups 12a / 1 / 2 / 3
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_project uuid := '6a000000-0000-4000-8000-000000000101';
  v_filed   jsonb;
  v_again   jsonb;
  v_a101    uuid;
  v_a102    uuid;
  v_print1  uuid;
  v_doc1    uuid;
  v_sheets  integer;
  v_prints  integer;
  v_docs    integer;
  v_raised  boolean;
BEGIN
  -- ── ACL posture ───────────────────────────────────────────────────────
  ASSERT has_table_privilege('authenticated', 'public.plan_sheets', 'SELECT'),
    'authenticated must read plan sheets';
  ASSERT NOT has_table_privilege('authenticated', 'public.plan_prints', 'INSERT'),
    'authenticated must not insert prints directly';
  ASSERT NOT has_table_privilege('authenticated', 'public.plan_issues', 'INSERT'),
    'authenticated must not insert issues directly';
  ASSERT NOT has_table_privilege('authenticated', 'public.plan_transmittal_tokens', 'SELECT'),
    'authenticated must have no table-wide read on the token table';
  ASSERT has_column_privilege('authenticated', 'public.plan_transmittal_tokens', 'status', 'SELECT'),
    'authenticated must read the safe token columns';
  ASSERT NOT has_column_privilege('authenticated', 'public.plan_transmittal_tokens', 'token_hash', 'SELECT'),
    'token_hash must be readable by service_role alone';
  ASSERT has_column_privilege('authenticated', 'public.plan_sheets', 'title', 'UPDATE'),
    'authenticated must rename a sheet';
  ASSERT NOT has_column_privilege('authenticated', 'public.plan_sheets', 'state', 'UPDATE'),
    'sharing state must not be hand-writable';
  ASSERT NOT has_column_privilege('authenticated', 'public.plan_sheets', 'current_print_id', 'UPDATE'),
    'the current-print pointer must not be hand-writable';

  ASSERT has_function_privilege(
    'authenticated', 'public.file_plan_prints(uuid,text,jsonb,text)', 'EXECUTE'),
    'authenticated must file prints';
  ASSERT has_function_privilege(
    'authenticated', 'public.preview_plan_issue(uuid,uuid[])', 'EXECUTE'),
    'authenticated must preview an issue';
  ASSERT has_function_privilege(
    'service_role', 'public.resolve_plan_transmittal(text)', 'EXECUTE'),
    'service_role resolves on the guest route''s behalf';
  ASSERT NOT has_function_privilege(
    'service_role', 'public.revoke_plan_transmittal_link(uuid)', 'EXECUTE'),
    'revoking a link is a studio act';
  -- Both of these require auth.uid(); a service_role grant could never be used,
  -- so carrying one would advertise a seam that does not exist.
  ASSERT NOT has_function_privilege(
    'service_role', 'public.create_plan_transmittal(uuid,text,uuid,text,text,text)', 'EXECUTE'),
    'create_plan_transmittal must not carry an unreachable service_role grant';
  ASSERT NOT has_function_privilege(
    'service_role', 'public.reissue_plan_transmittal_link(uuid)', 'EXECUTE'),
    'reissue_plan_transmittal_link must not carry an unreachable service_role grant';
  ASSERT NOT has_function_privilege(
    'authenticated', 'public._plan_room_immutable_row()', 'EXECUTE'),
    'authenticated must not invoke plan-room trigger functions';
  ASSERT NOT has_function_privilege(
    'service_role', 'public._plan_room_canonical_json(jsonb)', 'EXECUTE'),
    'service_role must not invoke plan-room private helpers';
  ASSERT NOT has_function_privilege(
    'authenticated', 'public._plan_room_set_doc_visibility(uuid,boolean)', 'EXECUTE'),
    'authenticated must not flip print visibility directly';

  -- ── Helper contracts ──────────────────────────────────────────────────
  ASSERT public._plan_room_canonical_json('{"b":1,"a":{"d":4,"c":3}}'::jsonb)
    = '{"a":{"c":3,"d":4},"b":1}',
    'canonical JSON must recursively sort keys and drop whitespace';
  ASSERT public._plan_room_rev_letter(1) = 'A'
     AND public._plan_room_rev_letter(26) = 'Z'
     AND public._plan_room_rev_letter(27) = 'AA'
     AND public._plan_room_rev_letter(52) = 'AZ'
     AND public._plan_room_rev_letter(53) = 'BA'
     AND public._plan_room_rev_letter(702) = 'ZZ',
    'revision letters must run A..Z then AA..ZZ';
  v_raised := false;
  BEGIN
    PERFORM public._plan_room_rev_letter(703);
  EXCEPTION WHEN check_violation THEN v_raised := true;
  END;
  ASSERT v_raised, 'revision letters must refuse to run past ZZ';

  PERFORM pg_temp.assume_user('6a000000-0000-4000-8000-000000000001');

  -- ── (12a) An issue with nothing filed is not an issue ──────────────────
  v_raised := false;
  BEGIN
    PERFORM public.create_plan_issue(v_project, 'Empty set', 'issue-empty');
  EXCEPTION WHEN check_violation THEN v_raised := true;
  END;
  ASSERT v_raised, 'an empty plan room must refuse to issue';

  -- ── (1) Filing creates sheet + print + folio row, atomically ───────────
  v_filed := public.file_plan_prints(
    v_project, 'batch-1',
    jsonb_build_array(
      jsonb_build_object(
        'kind', 'new_sheet',
        'sheet', jsonb_build_object('number', 'A-101', 'title', 'Ground Floor Plan',
                                    'discipline', 'Architectural'),
        'print', jsonb_build_object(
          'storage_path', v_project || '/plans/a101-a.pdf',
          'sha256', repeat('a', 64), 'size_bytes', 111000, 'page_index', 0)),
      jsonb_build_object(
        'kind', 'new_sheet',
        'sheet', jsonb_build_object('number', 'A-102', 'title', 'Upper Floor Plan'),
        'print', jsonb_build_object(
          'storage_path', v_project || '/plans/a102-a.pdf',
          'sha256', repeat('b', 64), 'size_bytes', 222000))),
    'set-2026-08-06.pdf');

  ASSERT v_filed->>'idempotent' = 'false', 'a first filing is not a replay';
  ASSERT jsonb_array_length(v_filed->'prints') = 2, 'both sheets must be filed';
  ASSERT jsonb_array_length(v_filed->'flippedSheetIds') = 0,
    'nothing is superseded on a first filing';

  SELECT id INTO v_a101 FROM public.plan_sheets
   WHERE project_id = v_project AND sheet_number = 'A-101';
  SELECT id INTO v_a102 FROM public.plan_sheets
   WHERE project_id = v_project AND sheet_number = 'A-102';
  ASSERT v_a101 IS NOT NULL AND v_a102 IS NOT NULL, 'both sheets must exist';

  ASSERT (SELECT count(*) = 2 FROM public.plan_sheets WHERE project_id = v_project),
    'exactly two sheets';
  ASSERT (SELECT count(*) = 2 FROM public.plan_prints pp
          JOIN public.plan_sheets s ON s.id = pp.sheet_id
          WHERE s.project_id = v_project), 'exactly two prints';
  ASSERT (SELECT count(*) = 1 FROM public.plan_print_batches
          WHERE project_id = v_project), 'one filing act recorded';
  ASSERT (SELECT created_sheet_ids @> ARRAY[v_a101, v_a102]
            AND cardinality(created_sheet_ids) = 2
            AND cardinality(flipped_sheet_ids) = 0
          FROM public.plan_print_batches WHERE idempotency_key = 'batch-1'),
    'the batch must record which sheets it created and that nothing flipped';

  SELECT current_print_id INTO v_print1 FROM public.plan_sheets WHERE id = v_a101;
  ASSERT (SELECT print_number = 1 AND rev_letter = 'A' AND source = 'upload'
            AND source_filename = 'set-2026-08-06.pdf'
          FROM public.plan_prints WHERE id = v_print1),
    'the first print is Rev A of print 1';
  ASSERT (SELECT current_print_number = 1 AND state = 'draft'
            AND discipline = 'Architectural'
          FROM public.plan_sheets WHERE id = v_a101),
    'the pointer and the state must read as filed-but-unshared';

  SELECT project_document_id INTO v_doc1 FROM public.plan_prints WHERE id = v_print1;
  ASSERT (SELECT section_key = 'plan-room' AND category = 'drawing'
            AND doc_type = 'pdf' AND anchor_kind = 'section' AND status = 'ready'
            AND client_visible = false AND size_bytes = 111000
            AND project_id = v_project
            AND title = 'A-101 · Rev A — Ground Floor Plan'
          FROM public.project_documents WHERE id = v_doc1),
    'the folio row must be a plan-room drawing, unshared, correctly titled';

  -- ── (2) A second filing revises, it does not overwrite ─────────────────
  v_filed := public.file_plan_prints(
    v_project, 'batch-2',
    jsonb_build_array(
      jsonb_build_object(
        'kind', 'revision', 'sheet_id', v_a101,
        'print', jsonb_build_object(
          'storage_path', v_project || '/plans/a101-b.pdf',
          'sha256', repeat('c', 64), 'size_bytes', 333000)),
      jsonb_build_object('kind', 'confirm_current', 'sheet_id', v_a102)));

  ASSERT (v_filed#>>'{prints,0,revLetter}') = 'B', 'the second print is Rev B';
  ASSERT (v_filed#>>'{prints,0,isNewSheet}') = 'false', 'a revision is not a new sheet';
  ASSERT (SELECT current_print_number = 2 FROM public.plan_sheets WHERE id = v_a101),
    'the pointer must advance to print 2';
  ASSERT (SELECT current_print_id <> v_print1 FROM public.plan_sheets WHERE id = v_a101),
    'the pointer must name the new print';
  ASSERT (SELECT print_number = 1 AND rev_letter = 'A' AND sha256 = repeat('a', 64)
          FROM public.plan_prints WHERE id = v_print1),
    'print 1 must be untouched by the revision';
  ASSERT (SELECT confirmed_sheet_ids = ARRAY[v_a102]
            AND cardinality(created_sheet_ids) = 0
            AND cardinality(flipped_sheet_ids) = 0
          FROM public.plan_print_batches WHERE idempotency_key = 'batch-2'),
    'a revision of a draft sheet creates nothing and flips nothing';
  ASSERT (SELECT count(*) = 3 FROM public.plan_prints pp
          JOIN public.plan_sheets s ON s.id = pp.sheet_id
          WHERE s.project_id = v_project), 'three prints after the revision';

  -- ── (3) Replay is free; a reused key with a different set is not ───────
  SELECT count(*) INTO v_sheets FROM public.plan_sheets WHERE project_id = v_project;
  SELECT count(*) INTO v_prints FROM public.plan_prints pp
    JOIN public.plan_sheets s ON s.id = pp.sheet_id WHERE s.project_id = v_project;
  SELECT count(*) INTO v_docs FROM public.project_documents
   WHERE project_id = v_project AND section_key = 'plan-room';

  v_again := public.file_plan_prints(
    v_project, 'batch-2',
    jsonb_build_array(
      jsonb_build_object(
        'kind', 'revision', 'sheet_id', v_a101,
        'print', jsonb_build_object(
          'storage_path', v_project || '/plans/a101-b.pdf',
          'sha256', repeat('c', 64), 'size_bytes', 333000)),
      jsonb_build_object('kind', 'confirm_current', 'sheet_id', v_a102)));

  ASSERT v_again->>'idempotent' = 'true', 'the same key and set must replay';
  ASSERT v_again->>'batchId' = v_filed->>'batchId', 'a replay returns the same batch';
  ASSERT jsonb_array_length(v_again->'prints') = 1, 'a replay reports the batch''s prints';
  -- sheetNumber is dropped from the comparison only because it reads live and a
  -- sheet may be renumbered between the filing and the retry; every field that
  -- describes what the FILING did must match exactly.
  ASSERT (v_again->'prints'->0) - 'sheetNumber' = (v_filed->'prints'->0) - 'sheetNumber'
     AND v_again->'flippedSheetIds' = v_filed->'flippedSheetIds',
    'a replay must answer with the same prints and the same flip set as the original';
  ASSERT (SELECT count(*) FROM public.plan_sheets WHERE project_id = v_project) = v_sheets
     AND (SELECT count(*) FROM public.plan_prints pp
          JOIN public.plan_sheets s ON s.id = pp.sheet_id
          WHERE s.project_id = v_project) = v_prints
     AND (SELECT count(*) FROM public.project_documents
          WHERE project_id = v_project AND section_key = 'plan-room') = v_docs,
    'a replay must write nothing at all';

  v_raised := false;
  BEGIN
    PERFORM public.file_plan_prints(
      v_project, 'batch-2',
      jsonb_build_array(jsonb_build_object(
        'kind', 'revision', 'sheet_id', v_a102,
        'print', jsonb_build_object(
          'storage_path', v_project || '/plans/mismatch.pdf',
          'sha256', repeat('d', 64)))));
  EXCEPTION WHEN unique_violation THEN v_raised := true;
  END;
  ASSERT v_raised, 'a reused key with a different request must raise';

  -- The source filename is part of the request: same entries, different origin.
  v_raised := false;
  BEGIN
    PERFORM public.file_plan_prints(
      v_project, 'batch-2',
      jsonb_build_array(
        jsonb_build_object(
          'kind', 'revision', 'sheet_id', v_a101,
          'print', jsonb_build_object(
            'storage_path', v_project || '/plans/a101-b.pdf',
            'sha256', repeat('c', 64), 'size_bytes', 333000)),
        jsonb_build_object('kind', 'confirm_current', 'sheet_id', v_a102)),
      'a-different-source.pdf');
  EXCEPTION WHEN unique_violation THEN v_raised := true;
  END;
  ASSERT v_raised, 'the source filename must participate in the request hash';

  RAISE NOTICE 'plan_room: ACLs, filing, revision and idempotency assertions passed';
END
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Groups 4 / 5 / 6 / 7 / 8 / 9a / 10a
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_project  uuid := '6a000000-0000-4000-8000-000000000101';
  v_owner    uuid := '6a000000-0000-4000-8000-000000000001';
  v_outsider uuid := '6a000000-0000-4000-8000-000000000002';
  v_client   uuid := '6a000000-0000-4000-8000-000000000003';
  v_a101     uuid;
  v_a102     uuid;
  v_doc_a    uuid;
  v_doc_b    uuid;
  v_doc_c    uuid;
  v_print_a  uuid;
  v_loose    uuid;
  v_filed    jsonb;
  v_count    integer;
  v_raised   boolean;
BEGIN
  SELECT id INTO v_a101 FROM public.plan_sheets
   WHERE project_id = v_project AND sheet_number = 'A-101';
  SELECT id INTO v_a102 FROM public.plan_sheets
   WHERE project_id = v_project AND sheet_number = 'A-102';
  SELECT id, project_document_id INTO v_print_a, v_doc_a
    FROM public.plan_prints WHERE sheet_id = v_a101 AND print_number = 1;
  SELECT project_document_id INTO v_doc_b
    FROM public.plan_prints WHERE sheet_id = v_a101 AND print_number = 2;

  -- ── (4) Another studio's plan room does not exist ──────────────────────
  PERFORM pg_temp.assume_user(v_outsider);
  v_raised := false;
  BEGIN
    PERFORM public.file_plan_prints(
      v_project, 'batch-outsider',
      jsonb_build_array(jsonb_build_object(
        'kind', 'revision', 'sheet_id', v_a101,
        'print', jsonb_build_object(
          'storage_path', v_project || '/plans/unused.pdf',
          'sha256', repeat('e', 64)))));
  EXCEPTION WHEN insufficient_privilege THEN v_raised := true;
  END;
  ASSERT v_raised, 'an outsider must not file into another studio''s plan room';

  v_raised := false;
  BEGIN PERFORM public.preview_plan_issue(v_project);
  EXCEPTION WHEN insufficient_privilege THEN v_raised := true;
  END;
  ASSERT v_raised, 'an outsider must not preview another studio''s set';

  v_raised := false;
  BEGIN PERFORM public.create_plan_issue(v_project, 'Stolen', 'issue-outsider');
  EXCEPTION WHEN insufficient_privilege THEN v_raised := true;
  END;
  ASSERT v_raised, 'an outsider must not issue another studio''s set';

  v_raised := false;
  BEGIN PERFORM public.set_plan_sheet_state(v_a101, 'shared');
  EXCEPTION WHEN insufficient_privilege THEN v_raised := true;
  END;
  ASSERT v_raised, 'an outsider must not share another studio''s sheet';

  v_raised := false;
  BEGIN PERFORM public.delete_plan_sheet(v_a102);
  EXCEPTION WHEN insufficient_privilege THEN v_raised := true;
  END;
  ASSERT v_raised, 'an outsider must not retire another studio''s sheet';

  v_raised := false;
  BEGIN PERFORM public.get_plan_room_holdings(v_project);
  EXCEPTION WHEN insufficient_privilege THEN v_raised := true;
  END;
  ASSERT v_raised, 'an outsider must not read another studio''s holdings';

  PERFORM pg_temp.assume_user_role(v_outsider);
  SELECT count(*) INTO v_count FROM public.plan_sheets WHERE project_id = v_project;
  ASSERT v_count = 0, 'RLS must hide sheets from an outsider';
  SELECT count(*) INTO v_count FROM public.plan_prints WHERE sheet_id = v_a101;
  ASSERT v_count = 0, 'RLS must hide prints from an outsider';
  SELECT count(*) INTO v_count FROM public.plan_print_batches WHERE project_id = v_project;
  ASSERT v_count = 0, 'RLS must hide filings from an outsider';
  PERFORM pg_temp.reset_user_role();

  -- ── (5) The client sees nothing until the sheet is shared ──────────────
  PERFORM pg_temp.assume_user_role(v_client);
  SELECT count(*) INTO v_count FROM public.plan_sheets WHERE project_id = v_project;
  ASSERT v_count = 0, 'a draft sheet must be invisible to the client';
  SELECT count(*) INTO v_count FROM public.project_documents
   WHERE project_id = v_project AND section_key = 'plan-room';
  ASSERT v_count = 0, 'an unshared drawing must not reach the client''s folio';
  PERFORM pg_temp.reset_user_role();

  PERFORM pg_temp.assume_user(v_owner);
  PERFORM public.set_plan_sheet_state(v_a101, 'shared');

  ASSERT (SELECT client_visible FROM public.project_documents WHERE id = v_doc_b),
    'sharing must expose the current print''s folio row';
  ASSERT (SELECT NOT client_visible FROM public.project_documents WHERE id = v_doc_a),
    'sharing must not expose a superseded print';

  PERFORM pg_temp.assume_user_role(v_client);
  SELECT count(*) INTO v_count FROM public.plan_sheets WHERE project_id = v_project;
  ASSERT v_count = 1, 'the client sees exactly the shared sheet';
  SELECT count(*) INTO v_count FROM public.plan_prints WHERE sheet_id = v_a101;
  ASSERT v_count = 1, 'the client sees only the current print';
  SELECT count(*) INTO v_count FROM public.plan_prints
   WHERE sheet_id = v_a101 AND id = v_print_a;
  ASSERT v_count = 0, 'the client must never see a superseded print';
  SELECT count(*) INTO v_count FROM public.project_documents
   WHERE project_id = v_project AND section_key = 'plan-room';
  ASSERT v_count = 1, 'the client''s folio carries exactly one plan-room drawing';

  -- The client is a reader on this rail and nothing else. Both writes are
  -- filtered to zero rows by RLS rather than refused, which is the shape a
  -- portal sees; pinning the row count is what makes that visible.
  UPDATE public.plan_sheets SET title = 'Client rename' WHERE id = v_a101;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  ASSERT v_count = 0, 'a client must not be able to rename a sheet';
  UPDATE public.project_documents SET client_visible = false WHERE id = v_doc_b;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  ASSERT v_count = 0, 'a client must not be able to un-share their own drawing';
  PERFORM pg_temp.reset_user_role();

  -- ── (6) Re-filing a shared sheet flips visibility in one call ──────────
  PERFORM pg_temp.assume_user(v_owner);
  v_filed := public.file_plan_prints(
    v_project, 'batch-3',
    jsonb_build_array(jsonb_build_object(
      'kind', 'revision', 'sheet_id', v_a101,
      'print', jsonb_build_object(
        'storage_path', v_project || '/plans/a101-c.pdf',
        'sha256', repeat('f', 64), 'size_bytes', 444000))));

  ASSERT (v_filed#>>'{prints,0,revLetter}') = 'C', 'the third print is Rev C';
  ASSERT v_filed->'flippedSheetIds' = jsonb_build_array(v_a101),
    'the shared sheet must be reported as flipped';
  ASSERT (SELECT flipped_sheet_ids = ARRAY[v_a101]
          FROM public.plan_print_batches WHERE idempotency_key = 'batch-3'),
    'the flip must be recorded on the batch, not inferred later';
  v_doc_c := (v_filed#>>'{prints,0,projectDocumentId}')::uuid;
  ASSERT (SELECT client_visible FROM public.project_documents WHERE id = v_doc_c),
    'the new print must land already shared';
  ASSERT (SELECT NOT client_visible FROM public.project_documents WHERE id = v_doc_b),
    'the superseded print must leave the client''s folio in the same call';

  PERFORM pg_temp.assume_user_role(v_client);
  SELECT count(*) INTO v_count FROM public.project_documents
   WHERE project_id = v_project AND section_key = 'plan-room';
  ASSERT v_count = 1, 'the client still holds exactly one drawing for the sheet';
  PERFORM pg_temp.reset_user_role();

  -- ── (7) Unsharing hides everything ────────────────────────────────────
  PERFORM pg_temp.assume_user(v_owner);
  PERFORM public.set_plan_sheet_state(v_a101, 'draft');
  SELECT count(*) INTO v_count FROM public.project_documents d
    JOIN public.plan_prints pp ON pp.project_document_id = d.id
   WHERE pp.sheet_id = v_a101 AND d.client_visible;
  ASSERT v_count = 0, 'unsharing must hide every print of the sheet';

  PERFORM pg_temp.assume_user_role(v_client);
  SELECT count(*) INTO v_count FROM public.plan_sheets WHERE project_id = v_project;
  ASSERT v_count = 0, 'an unshared sheet disappears from the client again';
  PERFORM pg_temp.reset_user_role();

  -- ── (8) The folio freeze, exercised on the REAL write path ────────────
  -- The designer's own session, as the portal issues it: SET ROLE authenticated
  -- with their JWT claims. postgres-as-superuser is not the path an attacker
  -- has, so it is not the path this group tests.
  PERFORM pg_temp.assume_user_role(v_owner);

  -- THE ATTACK. Setting the GUC the guard once consulted must buy nothing:
  -- client_visible is judged against the value derived from the sheet, not
  -- against who is asking or what they have declared about themselves.
  v_raised := false;
  BEGIN
    PERFORM set_config('app.plan_room_doc_maintenance', v_doc_b::text, true);
    UPDATE public.project_documents SET client_visible = true WHERE id = v_doc_b;
  EXCEPTION WHEN check_violation THEN v_raised := true;
  END;
  PERFORM set_config('app.plan_room_doc_maintenance', '', true);
  ASSERT v_raised,
    'a superseded print must not become client-visible, GUC or no GUC';
  ASSERT (SELECT NOT client_visible FROM public.project_documents WHERE id = v_doc_b),
    'the refused write must leave the superseded print hidden';

  v_raised := false;
  BEGIN
    UPDATE public.project_documents SET client_visible = true WHERE id = v_doc_c;
  EXCEPTION WHEN check_violation THEN v_raised := true;
  END;
  ASSERT v_raised,
    'the current print of a DRAFT sheet must not be shared by hand either';

  -- Writing the derived value is not an attack, and is not refused.
  UPDATE public.project_documents SET client_visible = false WHERE id = v_doc_c;
  ASSERT (SELECT NOT client_visible FROM public.project_documents WHERE id = v_doc_c),
    'writing the already-derived value must be accepted';

  -- And the gate runs in both directions: once the sheet IS shared, the client
  -- cannot be quietly cut off from the drawing by editing the file.
  PERFORM public.set_plan_sheet_state(v_a101, 'shared');
  ASSERT (SELECT client_visible FROM public.project_documents WHERE id = v_doc_c),
    'sharing the sheet shares its current print';
  v_raised := false;
  BEGIN
    UPDATE public.project_documents SET client_visible = false WHERE id = v_doc_c;
  EXCEPTION WHEN check_violation THEN v_raised := true;
  END;
  ASSERT v_raised, 'a shared print must not be hidden by hand';
  PERFORM public.set_plan_sheet_state(v_a101, 'draft');

  v_raised := false;
  BEGIN
    UPDATE public.project_documents
       SET storage_path = v_project || '/plans/unused.pdf' WHERE id = v_doc_c;
  EXCEPTION WHEN check_violation THEN v_raised := true;
  END;
  ASSERT v_raised, 'a print''s file must not be swapped';

  v_raised := false;
  BEGIN
    UPDATE public.project_documents SET section_key = 'project' WHERE id = v_doc_c;
  EXCEPTION WHEN check_violation THEN v_raised := true;
  END;
  ASSERT v_raised, 'a print''s anchor must not be moved';

  v_raised := false;
  BEGIN
    UPDATE public.project_documents SET category = 'reference' WHERE id = v_doc_c;
  EXCEPTION WHEN check_violation THEN v_raised := true;
  END;
  ASSERT v_raised, 'a print''s category is pinned to drawing';

  v_raised := false;
  BEGIN
    UPDATE public.project_documents SET doc_type = 'image' WHERE id = v_doc_c;
  EXCEPTION WHEN check_violation THEN v_raised := true;
  END;
  ASSERT v_raised, 'a print''s doc_type is frozen';

  v_raised := false;
  BEGIN
    DELETE FROM public.project_documents WHERE id = v_doc_c;
  EXCEPTION WHEN check_violation THEN v_raised := true;
  END;
  ASSERT v_raised, 'a filed print''s folio row must not be deleted';

  UPDATE public.project_documents SET title = 'A-101 · Rev C — renamed'
   WHERE id = v_doc_c;
  ASSERT (SELECT title = 'A-101 · Rev C — renamed'
          FROM public.project_documents WHERE id = v_doc_c),
    'a print''s title stays editable';

  INSERT INTO public.project_documents (
    project_id, title, doc_type, category, storage_path, status, client_visible,
    uploaded_by
  ) VALUES (
    v_project, 'Loose site photo', 'pdf', 'reference',
    v_project || '/misc/loose.pdf', 'ready', false, v_owner
  ) RETURNING id INTO v_loose;

  UPDATE public.project_documents
     SET client_visible = true, storage_path = v_project || '/misc/loose-2.pdf',
         category = 'photo'
   WHERE id = v_loose;
  ASSERT (SELECT client_visible AND storage_path = v_project || '/misc/loose-2.pdf'
            AND category = 'photo'
          FROM public.project_documents WHERE id = v_loose),
    'an ordinary folio file must stay freely editable';
  DELETE FROM public.project_documents WHERE id = v_loose;
  ASSERT (SELECT count(*) = 0 FROM public.project_documents WHERE id = v_loose),
    'an ordinary folio file must stay deletable';

  PERFORM pg_temp.reset_user_role();
  PERFORM pg_temp.assume_user(v_owner);

  -- ── (9a) Prints are statements about the past ─────────────────────────
  v_raised := false;
  BEGIN
    UPDATE public.plan_prints SET sha256 = repeat('0', 64) WHERE id = v_print_a;
  EXCEPTION WHEN object_not_in_prerequisite_state THEN v_raised := true;
  END;
  ASSERT v_raised, 'a print must be immutable';

  v_raised := false;
  BEGIN
    DELETE FROM public.plan_prints WHERE id = v_print_a;
  EXCEPTION WHEN object_not_in_prerequisite_state THEN v_raised := true;
  END;
  ASSERT v_raised, 'a print must not be deleted';

  v_raised := false;
  BEGIN
    UPDATE public.plan_print_batches SET item_count = 99
     WHERE project_id = v_project AND idempotency_key = 'batch-1';
  EXCEPTION WHEN object_not_in_prerequisite_state THEN v_raised := true;
  END;
  ASSERT v_raised, 'a filing act must be immutable';

  -- ── (10a) A sheet number is free until an issue names it ──────────────
  PERFORM pg_temp.assume_user_role(v_owner);
  UPDATE public.plan_sheets SET sheet_number = 'A-202' WHERE id = v_a102;
  ASSERT (SELECT sheet_number = 'A-202' FROM public.plan_sheets WHERE id = v_a102),
    'an unissued sheet may be renumbered';
  UPDATE public.plan_sheets SET sheet_number = 'A-102' WHERE id = v_a102;

  v_raised := false;
  BEGIN
    UPDATE public.plan_sheets SET state = 'shared' WHERE id = v_a102;
  EXCEPTION WHEN insufficient_privilege THEN v_raised := true;
  END;
  ASSERT v_raised, 'sharing state must not be hand-written even by the owner';
  PERFORM pg_temp.reset_user_role();

  RAISE NOTICE 'plan_room: tenancy, client visibility, folio-freeze and rename assertions passed';
END
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Groups 11 / 10b / 9b / 13 / 14
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_project   uuid := '6a000000-0000-4000-8000-000000000101';
  v_owner     uuid := '6a000000-0000-4000-8000-000000000001';
  v_party     uuid := '6a000000-0000-4000-8000-000000000301';
  v_a101      uuid;
  v_a102      uuid;
  v_preview   jsonb;
  v_issue1    jsonb;
  v_issue2    jsonb;
  v_issue1_id uuid;
  v_issue2_id uuid;
  v_sent      jsonb;
  v_token     text;
  v_token2    text;
  v_resolved  jsonb;
  v_holdings  jsonb;
  v_party_dto jsonb;
  v_sheet_dto jsonb;
  v_recomputed text;
  v_raised    boolean;
BEGIN
  PERFORM pg_temp.assume_user(v_owner);
  SELECT id INTO v_a101 FROM public.plan_sheets
   WHERE project_id = v_project AND sheet_number = 'A-101';
  SELECT id INTO v_a102 FROM public.plan_sheets
   WHERE project_id = v_project AND sheet_number = 'A-102';

  -- ── (11) Preview, then issue ──────────────────────────────────────────
  v_preview := public.preview_plan_issue(v_project);
  ASSERT jsonb_array_length(v_preview->'sheets') = 2, 'preview lists every filed sheet';
  ASSERT v_preview->'priorIssue' IS NULL OR v_preview->>'priorIssue' IS NULL,
    'there is no prior issue yet';
  ASSERT jsonb_array_length(v_preview#>'{drift,added}') = 2,
    'with no prior issue every sheet reads as added';

  v_issue1 := public.create_plan_issue(v_project, 'Permit Set', 'issue-1');
  v_issue1_id := (v_issue1#>>'{issue,id}')::uuid;
  ASSERT v_issue1->>'idempotent' = 'false', 'a first issue is not a replay';
  ASSERT (v_issue1#>>'{issue,issueNumber}') = '1', 'the first issue is number 1';
  ASSERT (v_issue1#>>'{issue,sheetCount}') = '2', 'the issue carries both sheets';
  ASSERT (v_issue1#>>'{issue,priorIssueId}') IS NULL, 'the first issue follows nothing';
  ASSERT (v_issue1#>>'{issue,setChecksum}') = v_preview->>'checksumPreview',
    'the issued checksum must be the one the preview promised';

  ASSERT (SELECT count(*) = 2 FROM public.plan_issue_prints WHERE issue_id = v_issue1_id),
    'one snapshot per sheet';
  ASSERT (SELECT sheet_number = 'A-101' AND sheet_title = 'Ground Floor Plan'
            AND rev_letter = 'C' AND sha256 = repeat('f', 64)
          FROM public.plan_issue_prints
          WHERE issue_id = v_issue1_id AND sheet_id = v_a101),
    'the snapshot must copy the number, title, rev and hash';

  SELECT encode(extensions.digest(public._plan_room_canonical_json(
           jsonb_agg(jsonb_build_object(
             'sheetNumber', ip.sheet_number,
             'revLetter', ip.rev_letter,
             'sha256', ip.sha256
           ) ORDER BY upper(ip.sheet_number))), 'sha256'), 'hex')
    INTO v_recomputed
    FROM public.plan_issue_prints ip WHERE ip.issue_id = v_issue1_id;
  ASSERT v_recomputed = (v_issue1#>>'{issue,setChecksum}'),
    'the set checksum must be reproducible from the snapshots';

  -- Replay must not mint a second issue.
  ASSERT (public.create_plan_issue(v_project, 'Permit Set', 'issue-1'))->>'idempotent' = 'true',
    'the same issue key and request must replay';
  ASSERT (SELECT count(*) = 1 FROM public.plan_issues WHERE project_id = v_project),
    'a replayed issue must not be minted twice';

  v_raised := false;
  BEGIN
    PERFORM public.create_plan_issue(v_project, 'Different name', 'issue-1');
  EXCEPTION WHEN unique_violation THEN v_raised := true;
  END;
  ASSERT v_raised, 'a reused issue key with a different request must raise';

  -- Move A-102 on, then issue again: the chain and the drift.
  PERFORM public.file_plan_prints(
    v_project, 'batch-4',
    jsonb_build_array(jsonb_build_object(
      'kind', 'revision', 'sheet_id', v_a102,
      'print', jsonb_build_object(
        'storage_path', v_project || '/plans/a102-b.pdf',
        'sha256', repeat('1', 64), 'size_bytes', 555000))));

  v_issue2 := public.create_plan_issue(v_project, 'Bid Set', 'issue-2');
  v_issue2_id := (v_issue2#>>'{issue,id}')::uuid;
  ASSERT (v_issue2#>>'{issue,issueNumber}') = '2', 'the second issue is number 2';
  ASSERT (v_issue2#>>'{issue,priorIssueId}')::uuid = v_issue1_id,
    'the chain must name the prior issue';
  ASSERT (v_issue2#>>'{issue,setChecksum}') <> (v_issue1#>>'{issue,setChecksum}'),
    'a different set of revisions is a different checksum';
  ASSERT v_issue2#>'{drift,changed}' = jsonb_build_array(v_a102),
    'A-102 must read as changed';
  ASSERT v_issue2#>'{drift,unchanged}' = jsonb_build_array(v_a101),
    'A-101 must read as unchanged';
  ASSERT jsonb_array_length(v_issue2#>'{drift,added}') = 0
     AND jsonb_array_length(v_issue2#>'{drift,removed}') = 0,
    'nothing was added or removed between the two issues';

  -- "Everything" and "these two, which happen to be everything" are different
  -- requests: the first tracks the plan room as it grows, the second does not.
  v_raised := false;
  BEGIN
    PERFORM public.create_plan_issue(
      v_project, 'Bid Set', 'issue-2', ARRAY[v_a101, v_a102]);
  EXCEPTION WHEN unique_violation THEN v_raised := true;
  END;
  ASSERT v_raised,
    'naming the sheets explicitly is not a replay of an unnamed full-set issue';

  -- ── (10b) Once issued, the number is what the paperwork says ──────────
  PERFORM pg_temp.assume_user_role(v_owner);
  v_raised := false;
  BEGIN
    UPDATE public.plan_sheets SET sheet_number = 'A-999' WHERE id = v_a101;
  EXCEPTION WHEN check_violation THEN v_raised := true;
  END;
  ASSERT v_raised, 'an issued sheet must refuse to be renumbered';

  UPDATE public.plan_sheets SET title = 'Ground Floor Plan (rev)' WHERE id = v_a101;
  ASSERT (SELECT title = 'Ground Floor Plan (rev)'
          FROM public.plan_sheets WHERE id = v_a101),
    'an issued sheet''s title stays editable';
  UPDATE public.plan_sheets SET title = 'Ground Floor Plan' WHERE id = v_a101;
  PERFORM pg_temp.reset_user_role();
  PERFORM pg_temp.assume_user(v_owner);

  -- ── (9b) An issue is a statement about the past ───────────────────────
  v_raised := false;
  BEGIN
    DELETE FROM public.plan_issues WHERE id = v_issue1_id;
  EXCEPTION WHEN object_not_in_prerequisite_state THEN v_raised := true;
  END;
  ASSERT v_raised, 'an issue must not be deleted';

  v_raised := false;
  BEGIN
    UPDATE public.plan_issue_prints SET rev_letter = 'Z' WHERE issue_id = v_issue1_id;
  EXCEPTION WHEN object_not_in_prerequisite_state THEN v_raised := true;
  END;
  ASSERT v_raised, 'an issue snapshot must be immutable';

  -- ── (13) The link: mint, resolve, revoke, reissue ─────────────────────
  v_sent := public.create_plan_transmittal(
    v_issue2_id, 'production', v_party, NULL, NULL, 'Please build to this set.');
  v_token := v_sent->>'token';
  ASSERT v_token ~ '^[0-9a-f]{64}$', 'the raw token is 64 hex characters';
  ASSERT (v_sent#>>'{transmittal,partyDisplayName}') = 'Hollis Bright',
    'the recipient name is snapshotted from the roster';
  ASSERT (v_sent#>>'{transmittal,partyCompany}') = 'Hollis Millwork',
    'the recipient company is snapshotted into its own column';
  ASSERT (SELECT count(*) = 1 FROM public.plan_transmittals WHERE project_id = v_project),
    'one send recorded';
  ASSERT (SELECT count(*) = 1 FROM public.plan_transmittal_tokens
          WHERE transmittal_id = (v_sent#>>'{transmittal,id}')::uuid AND status = 'active'),
    'one live link';

  v_raised := false;
  BEGIN
    PERFORM public.create_plan_transmittal(v_issue2_id, 'production', v_party, 'Also free text');
  EXCEPTION WHEN check_violation THEN v_raised := true;
  END;
  ASSERT v_raised, 'a transmittal names exactly one recipient';

  v_raised := false;
  BEGIN
    PERFORM public.create_plan_transmittal(v_issue2_id, 'gossip', v_party);
  EXCEPTION WHEN check_violation THEN v_raised := true;
  END;
  ASSERT v_raised, 'a transmittal must carry a known purpose';

  v_resolved := public.resolve_plan_transmittal(v_token);
  ASSERT v_resolved IS NOT NULL, 'a live link must resolve';
  ASSERT v_resolved->>'studioName' = 'Plan Owner', 'the header names the studio';
  ASSERT v_resolved->>'recipientName' = 'Hollis Bright', 'the holder sees their own name';
  ASSERT v_resolved->>'recipientCompany' = 'Hollis Millwork',
    'the company is projected from its column, never parsed out of a name';
  ASSERT v_resolved->>'projectLabel' = 'Ashford Residence',
    'the project label travels — it is in every title block anyway';
  ASSERT v_resolved->>'issueName' = 'Bid Set', 'the issue names itself';
  ASSERT v_resolved->>'purpose' = 'production', 'the purpose travels';
  ASSERT v_resolved->>'setSha256' = (v_issue2#>>'{issue,setChecksum}'),
    'the holder can check the set checksum';
  ASSERT v_resolved->>'isCurrentSet' = 'true', 'the latest issue reads as current';
  ASSERT v_resolved->>'supersededByName' IS NULL, 'nothing has superseded it yet';
  ASSERT jsonb_array_length(v_resolved->'sheets') = 2, 'both sheets travel';
  ASSERT NOT (v_resolved->'sheets'->0) ? 'sheetId'
     AND NOT (v_resolved->'sheets'->0) ? 'storagePath',
    'no sheet uuid and no storage path may travel';
  ASSERT (v_resolved#>>'{sheets,0,number}') = 'A-101'
     AND (v_resolved#>>'{sheets,0,revLetter}') = 'C'
     AND (v_resolved#>>'{sheets,0,isCurrent}') = 'true'
     AND (v_resolved#>>'{sheets,0,sizeBytes}') = '444000',
    'the first sheet reads as its snapshot';

  ASSERT (SELECT view_count = 1 AND first_opened_at IS NOT NULL AND last_used_at IS NOT NULL
          FROM public.plan_transmittal_tokens
          WHERE transmittal_id = (v_sent#>>'{transmittal,id}')::uuid AND status = 'active'),
    'a successful resolve must record the opening';

  ASSERT public.resolve_plan_transmittal(repeat('9', 64)) IS NULL,
    'an unknown token is a dead link';
  ASSERT public.resolve_plan_transmittal('not-a-token') IS NULL,
    'a malformed token never reaches a lookup';
  ASSERT public.resolve_plan_transmittal(NULL) IS NULL, 'a null token is a dead link';

  ASSERT (public.revoke_plan_transmittal_link((v_sent#>>'{transmittal,id}')::uuid))
           ->>'revokedCount' = '1',
    'revoking kills the one live link';
  ASSERT public.resolve_plan_transmittal(v_token) IS NULL,
    'a revoked link is indistinguishable from one that never existed';

  v_token2 := (public.reissue_plan_transmittal_link((v_sent#>>'{transmittal,id}')::uuid))->>'token';
  ASSERT public.resolve_plan_transmittal(v_token) IS NULL,
    'reissuing must not revive the old link';
  ASSERT public.resolve_plan_transmittal(v_token2) IS NOT NULL,
    'the fresh link must resolve';
  ASSERT (SELECT count(*) = 1 FROM public.plan_transmittal_tokens
          WHERE transmittal_id = (v_sent#>>'{transmittal,id}')::uuid AND status = 'active'),
    'revoke-then-mint leaves exactly one live link';
  ASSERT (SELECT count(*) = 1 FROM public.plan_transmittals WHERE project_id = v_project),
    'nothing about the link touches the send record';

  -- ── (14) Once the set moves on, the holder is behind ──────────────────
  PERFORM public.file_plan_prints(
    v_project, 'batch-5',
    jsonb_build_array(jsonb_build_object(
      'kind', 'revision', 'sheet_id', v_a101,
      'print', jsonb_build_object(
        'storage_path', v_project || '/plans/a101-d.pdf',
        'sha256', repeat('2', 64), 'size_bytes', 666000))));

  v_resolved := public.resolve_plan_transmittal(v_token2);
  ASSERT v_resolved->>'isCurrentSet' = 'false',
    'a set with a superseded sheet is no longer current';
  ASSERT (v_resolved#>>'{sheets,0,number}') = 'A-101'
     AND (v_resolved#>>'{sheets,0,isCurrent}') = 'false',
    'the superseded sheet must say so';
  ASSERT (v_resolved#>>'{sheets,1,isCurrent}') = 'true',
    'the untouched sheet is still current';

  v_holdings := public.get_plan_room_holdings(v_project);
  ASSERT jsonb_array_length(v_holdings->'parties') = 1, 'one recipient is holding drawings';
  v_party_dto := v_holdings#>'{parties,0}';
  ASSERT v_party_dto->>'partyDisplayName' = 'Hollis Bright', 'holdings name the recipient';
  ASSERT v_party_dto->>'partyCompany' = 'Hollis Millwork', 'holdings carry the company';
  ASSERT v_party_dto->>'issueName' = 'Bid Set', 'holdings name the issue they hold';
  ASSERT v_party_dto->>'behindCount' = '1', 'exactly one sheet is behind';
  ASSERT (v_party_dto#>>'{activeLink,viewCount}')::integer >= 1,
    'holdings report that the link has been opened';
  v_sheet_dto := v_party_dto#>'{holds,0}';
  ASSERT v_sheet_dto->>'sheetNumber' = 'A-101'
     AND v_sheet_dto->>'heldRev' = 'C'
     AND v_sheet_dto->>'currentRev' = 'D'
     AND v_sheet_dto->>'behind' = 'true',
    'the holder is on Rev C of A-101 while the studio is on Rev D';
  ASSERT (v_party_dto#>>'{holds,1,behind}') = 'false',
    'the sheet they are current on must not read as behind';

  RAISE NOTICE 'plan_room: issue, snapshot, transmittal and holdings assertions passed';
END
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Free-text recipients, token expiry, and the exhaustive anon sweep
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_project   uuid := '6a000000-0000-4000-8000-000000000101';
  v_owner     uuid := '6a000000-0000-4000-8000-000000000001';
  v_outsider  uuid := '6a000000-0000-4000-8000-000000000002';
  v_issue2_id uuid;
  v_sent      jsonb;
  v_sent2     jsonb;
  v_token     text;
  v_resolved  jsonb;
  v_holdings  jsonb;
  v_party_dto jsonb;
  v_hollis    uuid;
  v_rel       record;
  v_fn        record;
  v_count     integer;
  v_raised    boolean;
BEGIN
  PERFORM pg_temp.assume_user(v_owner);
  SELECT id INTO v_issue2_id FROM public.plan_issues
   WHERE project_id = v_project AND issue_number = 2;
  SELECT id INTO v_hollis FROM public.plan_transmittals
   WHERE project_id = v_project AND party_display_name = 'Hollis Bright';

  -- ── A recipient who will never be on the roster ───────────────────────
  v_sent2 := public.create_plan_transmittal(
    v_issue2_id, 'pricing', NULL, 'Marta Vance', 'Vance Stone', 'For pricing only.');
  v_token := v_sent2->>'token';
  ASSERT (v_sent2#>>'{transmittal,partyId}') IS NULL,
    'a free-text send has no roster row';
  ASSERT (v_sent2#>>'{transmittal,partyDisplayName}') = 'Marta Vance'
     AND (v_sent2#>>'{transmittal,partyCompany}') = 'Vance Stone',
    'the free-text name and company are stored as themselves, never concatenated';

  v_resolved := public.resolve_plan_transmittal(v_token);
  ASSERT v_resolved->>'recipientName' = 'Marta Vance'
     AND v_resolved->>'recipientCompany' = 'Vance Stone',
    'a free-text holder sees their own name and company';
  ASSERT v_resolved->>'purpose' = 'pricing', 'their purpose is their own';

  v_holdings := public.get_plan_room_holdings(v_project);
  ASSERT jsonb_array_length(v_holdings->'parties') = 2,
    'roster and free-text recipients both appear in holdings';
  SELECT elem INTO v_party_dto
    FROM jsonb_array_elements(v_holdings->'parties') AS elem
   WHERE elem->>'partyDisplayName' = 'Marta Vance';
  ASSERT v_party_dto IS NOT NULL, 'the free-text recipient must be grouped by name';
  ASSERT v_party_dto->>'partyId' IS NULL, 'a free-text recipient has no party id';
  ASSERT v_party_dto->>'partyCompany' = 'Vance Stone',
    'the free-text company travels into holdings';
  ASSERT v_party_dto->>'behindCount' = '1',
    'the free-text holder is behind on the same sheet';

  -- A second send to the SAME folded name collapses into one holding: 'Marta
  -- Vance' and '  marta vance ' are one person to everyone who reads them.
  v_sent := public.create_plan_transmittal(
    v_issue2_id, 'record', NULL, '  marta vance ', 'Vance Stone');
  ASSERT (SELECT count(*) = 3 FROM public.plan_transmittals WHERE project_id = v_project),
    'the second send is still its own record';
  v_holdings := public.get_plan_room_holdings(v_project);
  ASSERT jsonb_array_length(v_holdings->'parties') = 2,
    'the same recipient typed twice is still one recipient';
  SELECT count(*) INTO v_count
    FROM jsonb_array_elements(v_holdings->'parties') AS elem
   WHERE lower(btrim(elem->>'partyDisplayName')) = 'marta vance';
  ASSERT v_count = 1, 'the folded name must produce exactly one holding row';
  SELECT elem INTO v_party_dto
    FROM jsonb_array_elements(v_holdings->'parties') AS elem
   WHERE lower(btrim(elem->>'partyDisplayName')) = 'marta vance';
  -- Both sends carry the same sent_at (one transaction, one now()), so which of
  -- the two is 'latest' is a tie broken on id — an ambiguity that cannot arise
  -- outside a test, where the two acts are seconds apart. What must hold either
  -- way is that ONE of them is reported, whole.
  ASSERT v_party_dto->>'purpose' IN ('pricing', 'record'),
    'holdings must report one of the recipient''s own sends';
  ASSERT v_party_dto->>'issueName' = 'Bid Set',
    'the reported send must carry its own issue';

  -- ── A link can die of old age ─────────────────────────────────────────
  PERFORM pg_temp.reset_user_role();
  UPDATE public.plan_transmittal_tokens
     SET expires_at = now() - interval '1 day'
   WHERE transmittal_id = (v_sent2#>>'{transmittal,id}')::uuid AND status = 'active';
  PERFORM pg_temp.assume_user(v_owner);
  ASSERT public.resolve_plan_transmittal(v_token) IS NULL,
    'an expired link is as dead as a revoked one';

  -- ── The outsider sweep, over the whole send rail ──────────────────────
  PERFORM pg_temp.assume_user(v_outsider);
  v_raised := false;
  BEGIN PERFORM public.create_plan_transmittal(v_issue2_id, 'pricing', NULL, 'Thief');
  EXCEPTION WHEN insufficient_privilege THEN v_raised := true;
  END;
  ASSERT v_raised, 'an outsider must not send another studio''s issue';

  v_raised := false;
  BEGIN PERFORM public.reissue_plan_transmittal_link(v_hollis);
  EXCEPTION WHEN insufficient_privilege THEN v_raised := true;
  END;
  ASSERT v_raised, 'an outsider must not reissue another studio''s link';

  v_raised := false;
  BEGIN PERFORM public.revoke_plan_transmittal_link(v_hollis);
  EXCEPTION WHEN insufficient_privilege THEN v_raised := true;
  END;
  ASSERT v_raised, 'an outsider must not revoke another studio''s link';

  PERFORM pg_temp.assume_user_role(v_outsider);
  SELECT count(*) INTO v_count FROM public.plan_issues WHERE project_id = v_project;
  ASSERT v_count = 0, 'RLS must hide issues from an outsider';
  SELECT count(*) INTO v_count FROM public.plan_issue_prints
   WHERE issue_id = v_issue2_id;
  ASSERT v_count = 0, 'RLS must hide issue snapshots from an outsider';
  SELECT count(*) INTO v_count FROM public.plan_transmittals WHERE project_id = v_project;
  ASSERT v_count = 0, 'RLS must hide sends from an outsider';
  SELECT count(*) INTO v_count FROM (
    SELECT id FROM public.plan_transmittal_tokens WHERE project_id = v_project
  ) AS t;
  ASSERT v_count = 0, 'RLS must hide links from an outsider';
  PERFORM pg_temp.reset_user_role();

  -- ── anon reaches nothing on this rail, exhaustively ───────────────────
  v_count := 0;
  FOR v_rel IN
    SELECT c.relname
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname LIKE 'plan\_%'
  LOOP
    v_count := v_count + 1;
    ASSERT NOT has_table_privilege('anon', 'public.' || v_rel.relname, 'SELECT')
       AND NOT has_table_privilege('anon', 'public.' || v_rel.relname, 'INSERT')
       AND NOT has_table_privilege('anon', 'public.' || v_rel.relname, 'UPDATE')
       AND NOT has_table_privilege('anon', 'public.' || v_rel.relname, 'DELETE')
       AND NOT has_any_column_privilege('anon', 'public.' || v_rel.relname, 'SELECT'),
      format('anon must reach nothing on public.%s', v_rel.relname);
    ASSERT (SELECT relrowsecurity FROM pg_class c2
            JOIN pg_namespace n2 ON n2.oid = c2.relnamespace
            WHERE n2.nspname = 'public' AND c2.relname = v_rel.relname),
      format('public.%s must have RLS enabled', v_rel.relname);
  END LOOP;
  ASSERT v_count = 7, 'the plan room is seven tables';

  v_count := 0;
  FOR v_fn IN
    SELECT p.oid, p.proacl, p.oid::regprocedure::text AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'file_plan_prints', 'set_plan_sheet_state', 'delete_plan_sheet',
        'preview_plan_issue', 'create_plan_issue', 'create_plan_transmittal',
        'reissue_plan_transmittal_link', 'revoke_plan_transmittal_link',
        'resolve_plan_transmittal', 'get_plan_room_holdings',
        '_plan_room_rev_letter', '_plan_room_canonical_json',
        '_plan_room_set_doc_visibility', '_plan_room_immutable_row',
        'guard_plan_sheets_row', 'guard_project_documents_plan_print')
  LOOP
    v_count := v_count + 1;
    ASSERT NOT has_function_privilege('anon', v_fn.oid, 'EXECUTE'),
      format('anon must not execute %s', v_fn.sig);
    -- PUBLIC cannot be named to has_function_privilege, and a NULL proacl means
    -- the creation default — which for a function is EXECUTE TO PUBLIC. Both
    -- are checked directly: grantee 0 is PUBLIC.
    ASSERT v_fn.proacl IS NOT NULL,
      format('%s must carry an explicit ACL, not the EXECUTE-to-PUBLIC default', v_fn.sig);
    ASSERT NOT EXISTS (
      SELECT 1 FROM aclexplode(v_fn.proacl) a
      WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE'),
      format('PUBLIC must not execute %s', v_fn.sig);
  END LOOP;
  ASSERT v_count = 16,
    'exactly sixteen plan-room functions exist — a stale overload was left behind';

  RAISE NOTICE 'plan_room: free-text recipients, expiry and exhaustive anon assertions passed';
END
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Partial issues: preview parity and the named-sheet refusals
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_project  uuid := '6a000000-0000-4000-8000-000000000101';
  v_owner    uuid := '6a000000-0000-4000-8000-000000000001';
  v_a101     uuid;
  v_a102     uuid;
  v_stranger uuid := '6a000000-0000-4000-8000-0000000009ff';
  v_preview  jsonb;
  v_issue    jsonb;
  v_issue_id uuid;
  v_raised   boolean;
BEGIN
  PERFORM pg_temp.assume_user(v_owner);
  SELECT id INTO v_a101 FROM public.plan_sheets
   WHERE project_id = v_project AND sheet_number = 'A-101';
  SELECT id INTO v_a102 FROM public.plan_sheets
   WHERE project_id = v_project AND sheet_number = 'A-102';

  -- A preview of a partial issue must describe THAT issue, not the full set.
  v_preview := public.preview_plan_issue(v_project, ARRAY[v_a102]);
  ASSERT jsonb_array_length(v_preview->'sheets') = 1,
    'a named preview lists only the named sheets';
  ASSERT (v_preview#>>'{sheets,0,sheetId}')::uuid = v_a102,
    'the named preview names the right sheet';
  ASSERT v_preview->>'checksumPreview'
     <> (public.preview_plan_issue(v_project))->>'checksumPreview',
    'a partial set is not the full set''s checksum';

  v_issue := public.create_plan_issue(
    v_project, 'Millwork Package', 'issue-3', ARRAY[v_a102]);
  v_issue_id := (v_issue#>>'{issue,id}')::uuid;
  ASSERT (v_issue#>>'{issue,sheetCount}') = '1', 'a partial issue carries one sheet';
  ASSERT (v_issue#>>'{issue,setChecksum}') = v_preview->>'checksumPreview',
    'the partial preview must promise the checksum the partial issue commits';
  ASSERT (SELECT count(*) = 1 FROM public.plan_issue_prints WHERE issue_id = v_issue_id),
    'one snapshot for one sheet';
  ASSERT (SELECT sheet_number = 'A-102' AND rev_letter = 'B'
          FROM public.plan_issue_prints WHERE issue_id = v_issue_id),
    'the partial snapshot records A-102 at its current revision';
  ASSERT v_issue#>'{drift,removed}' = jsonb_build_array(v_a101),
    'a sheet the prior issue carried and this one omits reads as removed';
  ASSERT v_issue#>'{drift,unchanged}' = jsonb_build_array(v_a102),
    'the carried sheet has not moved since the prior issue';

  -- A duplicated list is the same request: the write path dedupes, so the hash
  -- must too, or an honest retry becomes a key-reuse error.
  ASSERT (public.create_plan_issue(
            v_project, 'Millwork Package', 'issue-3',
            ARRAY[v_a102, v_a102]))->>'idempotent' = 'true',
    'a duplicate-bearing sheet list must hash as its deduped form';

  v_raised := false;
  BEGIN
    PERFORM public.create_plan_issue(
      v_project, 'Nonsense', 'issue-stranger', ARRAY[v_a102, v_stranger]);
  EXCEPTION WHEN check_violation THEN v_raised := true;
  END;
  ASSERT v_raised, 'an issue must refuse a sheet that is not in this plan room';

  v_raised := false;
  BEGIN
    PERFORM public.preview_plan_issue(v_project, ARRAY[v_stranger]);
  EXCEPTION WHEN check_violation THEN v_raised := true;
  END;
  ASSERT v_raised, 'a preview must refuse what the issue would refuse';

  RAISE NOTICE 'plan_room: partial-issue and preview-parity assertions passed';
END
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Every refusal branch of file_plan_prints, and the proof it writes nothing
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_project uuid := '6a000000-0000-4000-8000-000000000101';
  v_foreign uuid := '6a000000-0000-4000-8000-000000000102';
  v_owner   uuid := '6a000000-0000-4000-8000-000000000001';
  v_bare    uuid := '6a000000-0000-4000-8000-000000000402';
  v_a101    uuid;
  v_sheets  integer;
  v_prints  integer;
  v_batches integer;
  v_docs    integer;
  v_raised  boolean;
BEGIN
  PERFORM pg_temp.assume_user(v_owner);
  SELECT id INTO v_a101 FROM public.plan_sheets
   WHERE project_id = v_project AND sheet_number = 'A-101';

  -- A sheet with nothing filed on it, for the confirm_current branch.
  INSERT INTO public.plan_sheets (id, project_id, sheet_number, title, state, created_by)
  VALUES (v_bare, v_project, 'Z-998', 'Reserved', 'draft', v_owner);

  SELECT count(*) INTO v_sheets FROM public.plan_sheets WHERE project_id = v_project;
  SELECT count(*) INTO v_prints FROM public.plan_prints pp
    JOIN public.plan_sheets s ON s.id = pp.sheet_id WHERE s.project_id = v_project;
  SELECT count(*) INTO v_batches FROM public.plan_print_batches WHERE project_id = v_project;
  SELECT count(*) INTO v_docs FROM public.project_documents
   WHERE project_id = v_project AND section_key = 'plan-room';

  -- 1. An empty payload.
  v_raised := false;
  BEGIN
    PERFORM public.file_plan_prints(v_project, 'neg-empty', '[]'::jsonb);
  EXCEPTION WHEN check_violation THEN v_raised := true;
  END;
  ASSERT v_raised, 'a filing with no entries must raise';

  -- 2. More than a single drop can honestly be.
  v_raised := false;
  BEGIN
    PERFORM public.file_plan_prints(v_project, 'neg-65', (
      SELECT jsonb_agg(jsonb_build_object(
        'kind', 'new_sheet',
        'sheet', jsonb_build_object('number', 'X-' || i, 'title', 'Bulk'),
        'print', jsonb_build_object(
          'storage_path', v_project || '/plans/unused.pdf',
          'sha256', repeat('a', 64))))
      FROM generate_series(1, 65) AS i));
  EXCEPTION WHEN check_violation THEN v_raised := true;
  END;
  ASSERT v_raised, 'a filing of 65 entries must raise';

  -- 3. Nothing was uploaded.
  v_raised := false;
  BEGIN
    PERFORM public.file_plan_prints(v_project, 'neg-missing', jsonb_build_array(
      jsonb_build_object('kind', 'revision', 'sheet_id', v_a101,
        'print', jsonb_build_object(
          'storage_path', v_project || '/plans/never-uploaded.pdf',
          'sha256', repeat('a', 64)))));
  EXCEPTION WHEN check_violation THEN v_raised := true;
  END;
  ASSERT v_raised, 'a print with no object behind it must raise';

  -- 4. Somebody else's storage prefix.
  v_raised := false;
  BEGIN
    PERFORM public.file_plan_prints(v_project, 'neg-prefix', jsonb_build_array(
      jsonb_build_object('kind', 'revision', 'sheet_id', v_a101,
        'print', jsonb_build_object(
          'storage_path', v_foreign || '/plans/a101-a.pdf',
          'sha256', repeat('a', 64)))));
  EXCEPTION WHEN check_violation THEN v_raised := true;
  END;
  ASSERT v_raised, 'a file outside the project''s own prefix must raise';

  -- 5. A file that is already somebody's document.
  v_raised := false;
  BEGIN
    PERFORM public.file_plan_prints(v_project, 'neg-claimed', jsonb_build_array(
      jsonb_build_object('kind', 'revision', 'sheet_id', v_a101,
        'print', jsonb_build_object(
          'storage_path', v_project || '/plans/a101-a.pdf',
          'sha256', repeat('a', 64)))));
  EXCEPTION WHEN check_violation THEN v_raised := true;
  END;
  ASSERT v_raised, 'a file already filed must raise';

  -- 6. The same file twice in one drop.
  v_raised := false;
  BEGIN
    PERFORM public.file_plan_prints(v_project, 'neg-dup-path', jsonb_build_array(
      jsonb_build_object('kind', 'revision', 'sheet_id', v_a101,
        'print', jsonb_build_object(
          'storage_path', v_project || '/plans/unused.pdf',
          'sha256', repeat('a', 64))),
      jsonb_build_object('kind', 'new_sheet',
        'sheet', jsonb_build_object('number', 'A-900', 'title', 'Dup path'),
        'print', jsonb_build_object(
          'storage_path', v_project || '/plans/unused.pdf',
          'sha256', repeat('a', 64)))));
  EXCEPTION WHEN check_violation THEN v_raised := true;
  END;
  ASSERT v_raised, 'the same file twice in one batch must raise';

  -- 7. The same sheet twice in one drop.
  v_raised := false;
  BEGIN
    PERFORM public.file_plan_prints(v_project, 'neg-dup-sheet', jsonb_build_array(
      jsonb_build_object('kind', 'revision', 'sheet_id', v_a101,
        'print', jsonb_build_object(
          'storage_path', v_project || '/plans/unused.pdf',
          'sha256', repeat('a', 64))),
      jsonb_build_object('kind', 'confirm_current', 'sheet_id', v_a101)));
  EXCEPTION WHEN check_violation THEN v_raised := true;
  END;
  ASSERT v_raised, 'the same sheet twice in one batch must raise';

  -- 8. A new sheet at a number that is already taken.
  v_raised := false;
  BEGIN
    PERFORM public.file_plan_prints(v_project, 'neg-collide', jsonb_build_array(
      jsonb_build_object('kind', 'new_sheet',
        'sheet', jsonb_build_object('number', 'a-101 ', 'title', 'Collides'),
        'print', jsonb_build_object(
          'storage_path', v_project || '/plans/unused.pdf',
          'sha256', repeat('a', 64)))));
  EXCEPTION WHEN check_violation THEN v_raised := true;
  END;
  ASSERT v_raised,
    'a new sheet at an existing number must raise, case and whitespace folded';

  -- 9. Confirming a sheet that has nothing to confirm.
  v_raised := false;
  BEGIN
    PERFORM public.file_plan_prints(v_project, 'neg-confirm', jsonb_build_array(
      jsonb_build_object('kind', 'confirm_current', 'sheet_id', v_bare)));
  EXCEPTION WHEN check_violation THEN v_raised := true;
  END;
  ASSERT v_raised, 'confirming a sheet with no filed print must raise';

  -- 10. A hash that is not a hash.
  v_raised := false;
  BEGIN
    PERFORM public.file_plan_prints(v_project, 'neg-sha', jsonb_build_array(
      jsonb_build_object('kind', 'revision', 'sheet_id', v_a101,
        'print', jsonb_build_object(
          'storage_path', v_project || '/plans/unused.pdf',
          'sha256', 'DEADBEEF'))));
  EXCEPTION WHEN check_violation THEN v_raised := true;
  END;
  ASSERT v_raised, 'a malformed sha256 must raise';

  -- 11. An unknown entry kind.
  v_raised := false;
  BEGIN
    PERFORM public.file_plan_prints(v_project, 'neg-kind', jsonb_build_array(
      jsonb_build_object('kind', 'delete_sheet', 'sheet_id', v_a101)));
  EXCEPTION WHEN check_violation THEN v_raised := true;
  END;
  ASSERT v_raised, 'an unknown entry kind must raise';

  -- Nothing above wrote anything. That is the whole point of validating the
  -- entire payload before touching a row.
  ASSERT (SELECT count(*) FROM public.plan_sheets WHERE project_id = v_project) = v_sheets
     AND (SELECT count(*) FROM public.plan_prints pp
          JOIN public.plan_sheets s ON s.id = pp.sheet_id
          WHERE s.project_id = v_project) = v_prints
     AND (SELECT count(*) FROM public.plan_print_batches
          WHERE project_id = v_project) = v_batches
     AND (SELECT count(*) FROM public.project_documents
          WHERE project_id = v_project AND section_key = 'plan-room') = v_docs,
    'a refused filing must leave no sheet, print, batch or folio row behind';

  RAISE NOTICE 'plan_room: every file_plan_prints refusal branch passed, with no partial writes';
END
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Groups 15 / 12b / 16
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_project uuid := '6a000000-0000-4000-8000-000000000101';
  v_owner   uuid := '6a000000-0000-4000-8000-000000000001';
  v_empty   uuid := '6a000000-0000-4000-8000-000000000401';
  v_a101    uuid;
  v_count   integer;
  v_raised  boolean;
BEGIN
  SELECT id INTO v_a101 FROM public.plan_sheets
   WHERE project_id = v_project AND sheet_number = 'A-101';

  -- ── (15) token_hash is not a studio column ────────────────────────────
  PERFORM pg_temp.assume_user_role(v_owner);
  -- EXECUTE, not PERFORM: `PERFORM 1 FROM t` reads no column at all and would
  -- pass on any column grant. The star is the point of the assertion.
  v_raised := false;
  BEGIN
    EXECUTE 'SELECT * FROM public.plan_transmittal_tokens LIMIT 1';
  EXCEPTION WHEN insufficient_privilege THEN v_raised := true;
  END;
  ASSERT v_raised, 'SELECT * on the token table must fail for a studio member';

  v_raised := false;
  BEGIN
    EXECUTE 'SELECT token_hash FROM public.plan_transmittal_tokens LIMIT 1';
  EXCEPTION WHEN insufficient_privilege THEN v_raised := true;
  END;
  ASSERT v_raised, 'token_hash must be unreadable by a studio member';

  SELECT count(*) INTO v_count FROM (
    SELECT id, transmittal_id, project_id, status, expires_at, first_opened_at,
           view_count, last_used_at, created_at
    FROM public.plan_transmittal_tokens
    WHERE project_id = v_project
  ) AS safe;
  ASSERT v_count >= 1, 'the safe token columns must be readable';
  PERFORM pg_temp.reset_user_role();
  PERFORM pg_temp.assume_user(v_owner);

  -- ── (12b) A sheet with nothing filed cannot be shared ─────────────────
  INSERT INTO public.plan_sheets (
    id, project_id, sheet_number, title, state, created_by
  ) VALUES (
    v_empty, v_project, 'Z-999', 'Placeholder', 'draft', v_owner
  );

  v_raised := false;
  BEGIN
    PERFORM public.set_plan_sheet_state(v_empty, 'shared');
  EXCEPTION WHEN check_violation THEN v_raised := true;
  END;
  ASSERT v_raised, 'a sheet with no filed print cannot be shared';

  v_raised := false;
  BEGIN
    PERFORM public.set_plan_sheet_state(v_empty, 'archived');
  EXCEPTION WHEN check_violation THEN v_raised := true;
  END;
  ASSERT v_raised, 'a plan sheet is either draft or shared';

  -- ── (16) Retiring a sheet ─────────────────────────────────────────────
  ASSERT (public.delete_plan_sheet(v_empty))->>'deleted' = 'true',
    'an empty sheet may be retired';
  ASSERT (SELECT count(*) = 0 FROM public.plan_sheets WHERE id = v_empty),
    'the retired sheet must be gone';

  v_raised := false;
  BEGIN
    PERFORM public.delete_plan_sheet(v_a101);
  EXCEPTION WHEN check_violation THEN v_raised := true;
  END;
  ASSERT v_raised, 'a sheet with filed prints must refuse to be retired';
  ASSERT (SELECT count(*) = 1 FROM public.plan_sheets WHERE id = v_a101),
    'the refused delete must leave the sheet standing';

  -- A sheet that does not exist and a sheet that is not yours read the same.
  v_raised := false;
  BEGIN
    PERFORM public.delete_plan_sheet('6a000000-0000-4000-8000-0000000009fe');
  EXCEPTION WHEN insufficient_privilege THEN v_raised := true;
  END;
  ASSERT v_raised,
    'a missing sheet must answer the same insufficient_privilege as a foreign one';

  v_raised := false;
  BEGIN
    PERFORM public.set_plan_sheet_state('6a000000-0000-4000-8000-0000000009fe', 'shared');
  EXCEPTION WHEN insufficient_privilege THEN v_raised := true;
  END;
  ASSERT v_raised, 'sharing a missing sheet must not be distinguishable either';

  -- ── The deletion posture, stated in the schema ────────────────────────
  PERFORM pg_temp.reset_user_role();
  v_raised := false;
  BEGIN
    DELETE FROM public.projects WHERE id = v_project;
  EXCEPTION WHEN foreign_key_violation OR check_violation
                 OR object_not_in_prerequisite_state THEN v_raised := true;
  END;
  ASSERT v_raised,
    'a project with a plan room must refuse to be deleted by cascade';

  RAISE NOTICE 'plan_room: token-column, empty-sheet, retirement and deletion-posture assertions passed';
END
$$;

ROLLBACK;
