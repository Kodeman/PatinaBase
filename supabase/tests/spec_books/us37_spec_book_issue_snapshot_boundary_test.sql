-- 00827 / SQ-1301: deterministic issue vs chapter include-toggle.
-- Local exclusive DB only. Plain exception assertions: ON_ERROR_STOP is strict.
-- The test-only core hook pauses BEFORE the final item aggregate statement.
-- Legacy 00380 has already read chapters then; 00827 has read neither set.
-- No sleep-based race: wait for the issuing backend's actual advisory wait.
-- Fixtures are committed on a dblink setup session and cleaned on both paths.
-- The hooked function definition is restored inside the issue transaction.
CREATE EXTENSION IF NOT EXISTS dblink WITH SCHEMA extensions;

DO $test$
DECLARE
  v_dsn text := format(
    'hostaddr=%s port=%s dbname=%s user=postgres password=postgres connect_timeout=5',
    COALESCE(host(inet_server_addr()), '127.0.0.1'), inet_server_port(), current_database());
  v_cleanup text := $cleanup$
    SET app.ffe_mutation_rpc = 'on';
    DELETE FROM public.ffe_pricing_approvals WHERE project_id = '82700000-0000-4000-8000-000000000001';
    DELETE FROM public.projects WHERE id = '82700000-0000-4000-8000-000000000001';
    DELETE FROM public.products WHERE id = '82700000-0000-4000-8000-000000000401';
    -- Membership teardown uses the existing service-only last-owner bypass.
    SET ROLE service_role;
    DELETE FROM public.organizations WHERE id = '82700000-0000-4000-8000-0000000000f1';
    RESET ROLE;
    DELETE FROM auth.users WHERE id IN ('82700000-0000-4000-8000-0000000000a1', '82700000-0000-4000-8000-0000000000a2');
  $cleanup$;
  v_pid integer;
  v_deadline timestamptz;
  v_result jsonb;
  v_hook text := E'  SELECT\n    COALESCE(jsonb_agg(item_snapshot';
  v_original text;
BEGIN
  PERFORM extensions.dblink_connect('p827_setup', v_dsn);
  PERFORM extensions.dblink_connect('p827_issue', v_dsn);
  BEGIN
    PERFORM extensions.dblink_exec('p827_setup', v_cleanup);
    PERFORM extensions.dblink_exec('p827_setup', $fixture$
      SET statement_timeout = '30s';
      INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
      VALUES
        ('82700000-0000-4000-8000-0000000000a1', 'p827-lead@test.invalid', '', now(), now(), now(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
        ('82700000-0000-4000-8000-0000000000a2', 'p827-client@test.invalid', '', now(), now(), now(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
      INSERT INTO public.profiles (id, email, full_name, is_designer)
      VALUES
        ('82700000-0000-4000-8000-0000000000a1', 'p827-lead@test.invalid', 'P827 Lead', true),
        ('82700000-0000-4000-8000-0000000000a2', 'p827-client@test.invalid', 'P827 Client', false)
      ON CONFLICT (id) DO NOTHING;
      INSERT INTO public.organizations (id, type, name, slug, status)
      VALUES ('82700000-0000-4000-8000-0000000000f1', 'design_studio', 'P827 Studio', 'p827-studio-test', 'active');
      INSERT INTO public.organization_members (user_id, organization_id, role, status, joined_at)
      VALUES ('82700000-0000-4000-8000-0000000000a1', '82700000-0000-4000-8000-0000000000f1', 'owner', 'active', now());
      INSERT INTO public.user_roles (user_id, role_id, granted_by)
      SELECT '82700000-0000-4000-8000-0000000000a1'::uuid, id, '82700000-0000-4000-8000-0000000000a1'::uuid
      FROM public.roles WHERE name = 'studio_owner';
      INSERT INTO public.designer_clients (id, designer_id, client_id, client_name, client_email, status, source)
      VALUES ('82700000-0000-4000-8000-0000000000c1', '82700000-0000-4000-8000-0000000000a1',
              '82700000-0000-4000-8000-0000000000a2', 'P827 Client', 'p827-client@test.invalid', 'active', 'direct');
      INSERT INTO public.projects (id, name, designer_id, client_id, created_by, studio_id, status)
      VALUES ('82700000-0000-4000-8000-000000000001', 'P827 Residence',
              '82700000-0000-4000-8000-0000000000a1', '82700000-0000-4000-8000-0000000000a2',
              '82700000-0000-4000-8000-0000000000a1', '82700000-0000-4000-8000-0000000000f1', 'active');
      INSERT INTO public.project_phases (id, project_id, name, phase_key, status, sort_order, lane)
      VALUES ('82700000-0000-4000-8000-000000000002', '82700000-0000-4000-8000-000000000001',
              'P827 approvals', 'p827-approvals', 'pending', 0, 'thread');
      INSERT INTO public.project_rooms (id, project_id, name, sort_order)
      VALUES ('82700000-0000-4000-8000-000000000201', '82700000-0000-4000-8000-000000000001', 'Living Room', 0);
      INSERT INTO public.products (id, name, captured_at, layer, owner_user_id, price_trade, finish, images)
      VALUES ('82700000-0000-4000-8000-000000000401', 'P827 Lamp', now(), 'personal',
              '82700000-0000-4000-8000-0000000000a1', 10000, 'Bronze', ARRAY['https://example.invalid/p827.jpg']);
      SET request.jwt.claims = '{"sub":"82700000-0000-4000-8000-0000000000a1","role":"authenticated"}';
      SELECT public.place_product_in_project('82700000-0000-4000-8000-000000000001',
        '82700000-0000-4000-8000-000000000401', '82700000-0000-4000-8000-000000000201', NULL, 'lighting', '{}'::jsonb);
      UPDATE public.project_ffe_specs SET client_notes = 'Ready to approve.', readiness_status = 'ready'
      WHERE ffe_item_id IN (SELECT id FROM public.project_ffe_items WHERE project_id = '82700000-0000-4000-8000-000000000001');
      SELECT public.ensure_project_spec_book('82700000-0000-4000-8000-000000000001');
      UPDATE public.spec_book_chapters SET included = false
      WHERE spec_book_id = (SELECT id FROM public.spec_books WHERE project_id = '82700000-0000-4000-8000-000000000001');
    $fixture$);

    -- The remote function installs/restores the pause in a single transaction;
    -- rollback also restores the source if preparation raises.
    SELECT pg_get_functiondef('public._prepare_spec_book_issue_00403(uuid,text[],text,text,uuid,text,jsonb)'::regprocedure)
      INTO v_original;
    IF strpos(v_original, v_hook) = 0 THEN
      RAISE EXCEPTION 'test seam missing before final membership aggregate';
    END IF;
    PERFORM extensions.dblink_exec('p827_issue', $setup$
      SET statement_timeout = '30s';
      SET application_name = 'p827-issue';
      CREATE FUNCTION pg_temp.issue_with_pause() RETURNS jsonb LANGUAGE plpgsql AS $fn$
      DECLARE
        original text := pg_get_functiondef('public._prepare_spec_book_issue_00403(uuid,text[],text,text,uuid,text,jsonb)'::regprocedure);
        result jsonb;
        v_snapshot jsonb;
        v_revision uuid;
        v_approval uuid;
        v_decision jsonb;
        v_artifact uuid;
        v_count integer;
        v_original text;
      BEGIN
        EXECUTE replace(original, E'  SELECT\n    COALESCE(jsonb_agg(item_snapshot',
          E'  PERFORM pg_advisory_xact_lock(827, 1301);\n  SELECT\n    COALESCE(jsonb_agg(item_snapshot');
        PERFORM set_config('request.jwt.claims', '{"sub":"82700000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
        result := public.prepare_spec_book_issue(
          (SELECT id FROM public.spec_books WHERE project_id = '82700000-0000-4000-8000-000000000001'),
          ARRAY['client'], 'full', NULL, NULL, 'p827-race', '[]'::jsonb);
        EXECUTE original;
        v_original := original;
        v_snapshot := result#>'{revision,render_snapshot}';
        v_revision := (result#>>'{revision,id}')::uuid;
        IF jsonb_array_length(v_snapshot->'items') IS DISTINCT FROM 1 THEN
          RAISE EXCEPTION 'concurrent inclusion must freeze the priced fixed item';
        END IF;

        -- Turn the frozen edition into an issued client artifact, then use the
        -- real approval creator and the unchanged 00819 pricing snapshot writer.
        INSERT INTO public.project_documents (id, project_id, title, doc_type, storage_path, status, uploaded_by,
                                              section_key, client_visible, size_bytes)
        VALUES ('82700000-0000-4000-8000-000000000221', '82700000-0000-4000-8000-000000000001',
                'P827 edition', 'pdf', 'p827/spec.pdf', 'ready', '82700000-0000-4000-8000-0000000000a1', 'project', true, 4096);
        UPDATE public.spec_book_artifacts SET status = 'rendering',
          attempt_count = attempt_count + 1, render_started_at = now()
        WHERE revision_id = v_revision AND audience = 'client';
        UPDATE public.spec_book_artifacts SET status = 'ready', project_document_id = '82700000-0000-4000-8000-000000000221',
          storage_path = 'p827/spec.pdf', checksum_sha256 = repeat('1', 64), size_bytes = 4096, rendered_at = now()
        WHERE revision_id = v_revision AND audience = 'client' RETURNING id INTO v_artifact;
        UPDATE public.spec_book_revisions SET status = 'issued', issued_at = now() WHERE id = v_revision;
        PERFORM set_config('request.jwt.claims', '{"sub":"82700000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
        PERFORM public.set_project_decision_authority('82700000-0000-4000-8000-000000000001', '82700000-0000-4000-8000-0000000000a2', NULL, 0);
        v_decision := public.create_project_approval_decision('82700000-0000-4000-8000-000000000001', jsonb_build_object(
          'title', 'P827 approval', 'question', 'Approve this edition?', 'context', 'P827 fixture',
          'dueAt', (now() + interval '9 days')::text, 'phaseId', '82700000-0000-4000-8000-000000000002',
          'sectionKey', 'project', 'artifactKind', 'spec_book_artifact', 'artifactId', v_artifact,
          'costCentsDelta', 0, 'scheduleDaysDelta', 0, 'leadTimeDaysDelta', 0), 'p827-create', NULL);
        v_approval := public.snapshot_project_pricing('82700000-0000-4000-8000-000000000001',
                                                     'project_approval', (v_decision->>'decisionId')::uuid);
        SELECT count(*) INTO v_count FROM public.ffe_pricing_approval_lines WHERE approval_id = v_approval;
        IF v_count IS DISTINCT FROM 1 THEN
          RAISE EXCEPTION 'pricing writer must record the one frozen priced item';
        END IF;
        -- pdf.ts buildPagePlan emits an item sheet only for an unassigned item or
        -- one whose chapter is present. This is the reproduced missing-chapter
        -- fixture on legacy source, not a hand-authored malformed historical issue.
        IF EXISTS (
          SELECT 1 FROM public.ffe_pricing_approval_lines line
          JOIN jsonb_array_elements(v_snapshot->'items') item ON (item->>'ffeItemId')::uuid = line.item_id
          WHERE line.approval_id = v_approval AND NULLIF(item->>'chapterId', '') IS NOT NULL
            AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_snapshot->'chapters') chapter
                            WHERE chapter->>'id' = item->>'chapterId')
        ) THEN
          RAISE EXCEPTION 'missing-chapter fixture: no item may be recorded unless printed';
        END IF;
        IF (SELECT count(*) FROM public.spec_book_revision_items WHERE revision_id = v_revision) IS DISTINCT FROM 1::bigint THEN
          RAISE EXCEPTION 'revision item rows must reuse frozen membership';
        END IF;
        IF pg_get_functiondef('public._prepare_spec_book_issue_00403(uuid,text[],text,text,uuid,text,jsonb)'::regprocedure) IS DISTINCT FROM v_original THEN
          RAISE EXCEPTION 'test hook must restore original preparation source';
        END IF;
        RAISE NOTICE 'PASS concurrent include-toggle; missing-chapter printed/recorded equality; captured revision rows; hook restoration';

        RETURN result;
      END;
      $fn$;
    $setup$);
    SELECT pid INTO v_pid FROM extensions.dblink('p827_issue', 'SELECT pg_backend_pid()') AS t(pid integer);
    PERFORM extensions.dblink_exec('p827_issue', 'BEGIN');
    PERFORM pg_advisory_lock(827, 1301);
    PERFORM extensions.dblink_send_query('p827_issue', 'SELECT pg_temp.issue_with_pause()');
    v_deadline := clock_timestamp() + interval '10 seconds';
    LOOP
      EXIT WHEN EXISTS (SELECT 1 FROM pg_stat_activity WHERE pid = v_pid AND wait_event = 'advisory');
      IF clock_timestamp() > v_deadline THEN
        RAISE EXCEPTION 'issue never reached the controlled chapter/item capture boundary';
      END IF;
      PERFORM pg_sleep(0.01);
    END LOOP;
    -- The actual hook's mutation is direct chapter DML, matching the UI hook.
    -- Its committed inclusion happens after the old chapter SELECT and before
    -- the final item SELECT. No production function is weakened for the test.
    PERFORM extensions.dblink_exec('p827_setup', $toggle$
      UPDATE public.spec_book_chapters SET included = true
      WHERE spec_book_id = (SELECT id FROM public.spec_books WHERE project_id = '82700000-0000-4000-8000-000000000001');
    $toggle$);
    PERFORM pg_advisory_unlock(827, 1301);
    SELECT result INTO v_result FROM extensions.dblink_get_result('p827_issue') AS t(result jsonb);
    PERFORM result FROM extensions.dblink_get_result('p827_issue') AS t(result jsonb);
    PERFORM extensions.dblink_exec('p827_issue', 'ROLLBACK');
    RAISE NOTICE 'PASS concurrent include-toggle; missing-chapter printed/recorded equality; captured revision rows; hook restoration';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'boundary regression failed: %', SQLERRM;
    PERFORM pg_advisory_unlock(827, 1301);
    PERFORM extensions.dblink_disconnect('p827_issue');
    PERFORM extensions.dblink_exec('p827_setup', v_cleanup);
    PERFORM extensions.dblink_disconnect('p827_setup');
    RAISE;
  END;
  PERFORM extensions.dblink_disconnect('p827_issue');
  PERFORM extensions.dblink_exec('p827_setup', v_cleanup);
  PERFORM extensions.dblink_disconnect('p827_setup');
END;
$test$;
