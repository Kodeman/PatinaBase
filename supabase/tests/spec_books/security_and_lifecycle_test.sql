-- ═══════════════════════════════════════════════════════════════════════════
-- Spec Books schema/RLS/RPC/security lifecycle (00380)
--
-- Run:
--   psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 \
--     -f supabase/tests/spec_books/security_and_lifecycle_test.sql
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

INSERT INTO auth.users (
  id, email, encrypted_password, email_confirmed_at, created_at, updated_at,
  instance_id, aud, role
)
VALUES
  ('5b000000-0000-4000-8000-000000000001', 'spec-owner@test.invalid', '', now(), now(), now(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('5b000000-0000-4000-8000-000000000002', 'spec-outsider@test.invalid', '', now(), now(), now(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('5b000000-0000-4000-8000-000000000003', 'spec-client@test.invalid', '', now(), now(), now(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

INSERT INTO public.profiles (id, email, full_name, created_at, updated_at)
VALUES
  ('5b000000-0000-4000-8000-000000000001', 'spec-owner@test.invalid', 'Spec Owner', now(), now()),
  ('5b000000-0000-4000-8000-000000000002', 'spec-outsider@test.invalid', 'Spec Outsider', now(), now()),
  ('5b000000-0000-4000-8000-000000000003', 'spec-client@test.invalid', 'Spec Client', now(), now())
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name;

INSERT INTO public.projects (id, name, designer_id, client_id, created_by)
VALUES
  ('5b000000-0000-4000-8000-000000000101', 'Spec Project', '5b000000-0000-4000-8000-000000000001', '5b000000-0000-4000-8000-000000000003', '5b000000-0000-4000-8000-000000000001'),
  ('5b000000-0000-4000-8000-000000000102', 'Foreign Project', '5b000000-0000-4000-8000-000000000002', NULL, '5b000000-0000-4000-8000-000000000002');

INSERT INTO public.project_rooms (id, project_id, name, sort_order)
VALUES
  ('5b000000-0000-4000-8000-000000000201', '5b000000-0000-4000-8000-000000000101', 'Living Room', 0),
  ('5b000000-0000-4000-8000-000000000202', '5b000000-0000-4000-8000-000000000102', 'Foreign Room', 0);

INSERT INTO public.vendors (id, name)
VALUES ('5b000000-0000-4000-8000-000000000301', 'Spec Vendor');

INSERT INTO public.products (
  id, name, source_url, captured_by, captured_at, layer, owner_user_id,
  status, finish, materials, images, vendor_id, price_retail, price_trade
)
VALUES (
  '5b000000-0000-4000-8000-000000000401',
  'Walnut Chair',
  'https://example.invalid/chair',
  '5b000000-0000-4000-8000-000000000001',
  now(),
  'personal',
  '5b000000-0000-4000-8000-000000000001',
  'draft',
  'Oiled walnut',
  ARRAY['Walnut'],
  ARRAY['https://example.invalid/chair.jpg'],
  '5b000000-0000-4000-8000-000000000301',
  125000,
  80000
);

-- One empty placeholder = an existing slot.
INSERT INTO public.project_ffe_items (
  id, project_id, project_room_id, name, doc_code, status, quantity, sort_order
)
VALUES (
  '5b000000-0000-4000-8000-000000000501',
  '5b000000-0000-4000-8000-000000000101',
  '5b000000-0000-4000-8000-000000000201',
  'Chair placeholder',
  'LR-01',
  'specified',
  1,
  0
);

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

DO $$
DECLARE
  v_book public.spec_books;
  v_book_again public.spec_books;
  v_place jsonb;
  v_second_item uuid;
  v_issue jsonb;
  v_issue_again jsonb;
  v_addendum jsonb;
  v_addendum_id uuid;
  v_revision_id uuid;
  v_revision public.spec_book_revisions;
  v_artifact record;
  v_document_id uuid;
  v_share jsonb;
  v_token text;
  v_bad_token text := 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
  v_count integer;
  v_version integer;
  v_raised boolean;
  v_detail text;
BEGIN
  -- ACLs are explicit and revision writes remain RPC/service-only.
  ASSERT has_table_privilege('authenticated', 'public.spec_books', 'SELECT'),
    'authenticated must read working books';
  ASSERT NOT has_table_privilege('anon', 'public.spec_books', 'SELECT'),
    'anon must not read working books';
  ASSERT NOT has_table_privilege('authenticated', 'public.spec_book_revisions', 'INSERT'),
    'authenticated must not insert revision rows directly';
  ASSERT has_function_privilege(
    'authenticated',
    'public.prepare_spec_book_issue(uuid,text[],text,text,uuid,text,jsonb)',
    'EXECUTE'
  ), 'authenticated must execute prepare';
  ASSERT NOT has_function_privilege(
    'anon',
    'public.resolve_spec_book_share(text)',
    'EXECUTE'
  ), 'anon must not probe shares directly';

  -- Canonical compact JSON hash contract (sorted keys, no whitespace).
  ASSERT public._spec_book_canonical_json('{"b":1,"a":{"d":4,"c":3}}'::jsonb)
    = '{"a":{"c":3,"d":4},"b":1}',
    'canonical JSON must recursively sort keys and remove separator whitespace';
  ASSERT public._spec_book_canonical_json('{"decimal":1.00,"negativeZero":-0.0}'::jsonb)
    = '{"decimal":1,"negativeZero":0}',
    'canonical JSON numbers must match JSON.stringify normalization';

  PERFORM pg_temp.assume_user('5b000000-0000-4000-8000-000000000001');

  -- ensure is idempotent and composes room chapters + existing item settings.
  v_book := public.ensure_project_spec_book('5b000000-0000-4000-8000-000000000101');
  v_book_again := public.ensure_project_spec_book('5b000000-0000-4000-8000-000000000101');
  ASSERT v_book.id = v_book_again.id, 'one project must have one canonical book';
  ASSERT (
    SELECT count(*) = 1 FROM public.spec_book_chapters WHERE spec_book_id = v_book.id
  ), 'ensure must compose the room chapter';
  ASSERT (
    SELECT count(*) = 1 FROM public.spec_book_item_settings WHERE spec_book_id = v_book.id
  ), 'ensure must compose the placeholder item setting';

  -- Atomic fill-slot and create-new-line share one placement path.
  v_place := public.place_product_in_project(
    '5b000000-0000-4000-8000-000000000101',
    '5b000000-0000-4000-8000-000000000401',
    '5b000000-0000-4000-8000-000000000201',
    '5b000000-0000-4000-8000-000000000501',
    'seating',
    '{"client":"chrome","captureId":"cap-1"}'::jsonb
  );
  ASSERT v_place->>'placement' = 'filled_slot', 'existing slot must be filled';
  ASSERT (
    SELECT product_id = '5b000000-0000-4000-8000-000000000401'
    FROM public.project_ffe_items
    WHERE id = '5b000000-0000-4000-8000-000000000501'
  ), 'slot fill must set the reusable product';

  v_place := public.place_product_in_project(
    '5b000000-0000-4000-8000-000000000101',
    '5b000000-0000-4000-8000-000000000401',
    '5b000000-0000-4000-8000-000000000201',
    NULL,
    'seating',
    '{"client":"field","captureId":"cap-2"}'::jsonb
  );
  v_second_item := (v_place->>'ffeItemId')::uuid;
  ASSERT v_place->>'placement' = 'created_line', 'NULL slot must create a line';
  ASSERT v_second_item <> '5b000000-0000-4000-8000-000000000501',
    'duplicate product use must remain a distinct project selection';
  ASSERT (
    SELECT count(*) = 2
    FROM public.project_ffe_items
    WHERE project_id = '5b000000-0000-4000-8000-000000000101'
      AND product_id = '5b000000-0000-4000-8000-000000000401'
  ), 'same product master must support distinct FF&E lines';

  -- Filled-slot conflicts and foreign-room placement are atomic.
  v_raised := false;
  BEGIN
    PERFORM public.place_product_in_project(
      '5b000000-0000-4000-8000-000000000101',
      '5b000000-0000-4000-8000-000000000401',
      '5b000000-0000-4000-8000-000000000201',
      '5b000000-0000-4000-8000-000000000501',
      NULL,
      '{}'::jsonb
    );
  EXCEPTION WHEN unique_violation THEN
    v_raised := true;
  END;
  ASSERT v_raised, 'occupied slot must reject a second placement';

  v_raised := false;
  BEGIN
    PERFORM public.place_product_in_project(
      '5b000000-0000-4000-8000-000000000101',
      '5b000000-0000-4000-8000-000000000401',
      '5b000000-0000-4000-8000-000000000202',
      NULL,
      NULL,
      '{}'::jsonb
    );
  EXCEPTION WHEN check_violation THEN
    v_raised := true;
  END;
  ASSERT v_raised, 'foreign-project room must be rejected';
  ASSERT (
    SELECT count(*) = 2
    FROM public.project_ffe_items
    WHERE project_id = '5b000000-0000-4000-8000-000000000101'
  ), 'failed placement must not create a partial line';

  -- Complete both selections without mutating the Product master.
  UPDATE public.project_ffe_items
  SET doc_code = 'LR-02'
  WHERE id = v_second_item;
  UPDATE public.project_ffe_specs
  SET finish = CASE
        WHEN ffe_item_id = '5b000000-0000-4000-8000-000000000501'
          THEN 'Natural oil'
        ELSE 'Ebonized'
      END,
      exact_location = 'Living Room north wall',
      client_notes = 'Approved selection.',
      readiness_status = 'ready'
  WHERE ffe_item_id IN ('5b000000-0000-4000-8000-000000000501', v_second_item);

  ASSERT (
    SELECT finish = 'Oiled walnut'
    FROM public.products WHERE id = '5b000000-0000-4000-8000-000000000401'
  ), 'project selection edits must never overwrite product master data';

  SELECT row_version INTO v_version
  FROM public.project_ffe_specs
  WHERE ffe_item_id = '5b000000-0000-4000-8000-000000000501';
  UPDATE public.project_ffe_specs
  SET client_notes = 'Approved selection, revised.'
  WHERE ffe_item_id = '5b000000-0000-4000-8000-000000000501';
  ASSERT (
    SELECT row_version = v_version + 1
    FROM public.project_ffe_specs
    WHERE ffe_item_id = '5b000000-0000-4000-8000-000000000501'
  ), 'selection update must advance optimistic row_version';

  -- A stale expectedRowVersion blocks issue preparation.
  UPDATE public.spec_book_item_settings
  SET publication_overrides = jsonb_build_object('expectedRowVersion', v_version)
  WHERE spec_book_id = v_book.id
    AND ffe_item_id = '5b000000-0000-4000-8000-000000000501';
  v_raised := false;
  BEGIN
    PERFORM public.prepare_spec_book_issue(
      v_book.id, ARRAY['client'], 'full', NULL, NULL, 'issue-stale', '[]'::jsonb
    );
  EXCEPTION WHEN check_violation THEN
    v_raised := true;
  END;
  ASSERT v_raised, 'optimistic row-version conflict must block publication';

  UPDATE public.spec_book_item_settings s
  SET publication_overrides = jsonb_build_object('expectedRowVersion', sp.row_version)
  FROM public.project_ffe_specs sp
  WHERE s.ffe_item_id = sp.ffe_item_id
    AND s.spec_book_id = v_book.id;

  -- Installer issues require both a location and actionable install notes at
  -- the RPC boundary, even if a caller bypasses the portal preflight.
  v_raised := false;
  v_detail := NULL;
  BEGIN
    PERFORM public.prepare_spec_book_issue(
      v_book.id, ARRAY['installer'], 'full', NULL, NULL,
      'issue-missing-install-notes', '[]'::jsonb
    );
  EXCEPTION WHEN check_violation THEN
    GET STACKED DIAGNOSTICS v_detail = PG_EXCEPTION_DETAIL;
    v_raised := position('missing_install_notes' IN COALESCE(v_detail, '')) > 0;
  END;
  ASSERT v_raised, 'missing installer notes must be a SQL preflight blocker';

  UPDATE public.project_ffe_specs
  SET install_notes = 'Confirm wall clearance before setting the chair.'
  WHERE ffe_item_id IN ('5b000000-0000-4000-8000-000000000501', v_second_item);
  UPDATE public.spec_book_item_settings s
  SET publication_overrides = jsonb_build_object('expectedRowVersion', sp.row_version)
  FROM public.project_ffe_specs sp
  WHERE s.ffe_item_id = sp.ffe_item_id
    AND s.spec_book_id = v_book.id;

  -- Prepare freezes one normalized row per item and one artifact per audience.
  v_issue := public.prepare_spec_book_issue(
    v_book.id,
    ARRAY['internal','client','installer'],
    'full',
    NULL,
    NULL,
    'issue-1',
    '[]'::jsonb
  );
  v_revision_id := (v_issue#>>'{revision,id}')::uuid;
  ASSERT v_issue->>'idempotent' = 'false', 'first prepare must create a revision';
  ASSERT (
    SELECT count(*) = 2 FROM public.spec_book_revision_items
    WHERE revision_id = v_revision_id
  ), 'revision must normalize every included item';
  ASSERT (
    SELECT count(*) = 3 FROM public.spec_book_artifacts
    WHERE revision_id = v_revision_id
  ), 'prepare must create one artifact per requested audience';
  ASSERT (
    SELECT snapshot_checksum = encode(
      extensions.digest(public._spec_book_canonical_json(render_snapshot), 'sha256'), 'hex'
    )
    FROM public.spec_book_revisions WHERE id = v_revision_id
  ), 'snapshot checksum must use canonical compact JSON';

  v_issue_again := public.prepare_spec_book_issue(
    v_book.id,
    ARRAY['client','installer','internal'],
    'full',
    NULL,
    NULL,
    'issue-1',
    '[]'::jsonb
  );
  ASSERT v_issue_again->>'idempotent' = 'true', 'retry must be idempotent';
  ASSERT (v_issue_again#>>'{revision,id}')::uuid = v_revision_id,
    'idempotent retry must return the same revision';

  -- Frozen item snapshots/revision payloads reject direct mutation.
  v_raised := false;
  BEGIN
    UPDATE public.spec_book_revision_items
    SET item_snapshot = item_snapshot || '{"tampered":true}'::jsonb
    WHERE revision_id = v_revision_id;
  EXCEPTION WHEN object_not_in_prerequisite_state THEN
    v_raised := true;
  END;
  ASSERT v_raised, 'revision items must be immutable';

  v_raised := false;
  BEGIN
    UPDATE public.spec_book_revisions
    SET render_snapshot = render_snapshot || '{"tampered":true}'::jsonb
    WHERE id = v_revision_id;
  EXCEPTION WHEN object_not_in_prerequisite_state THEN
    v_raised := true;
  END;
  ASSERT v_raised, 'revision snapshot must be immutable';

  -- Finalization fails closed until every requested artifact is durable.
  v_raised := false;
  BEGIN
    PERFORM public.finalize_spec_book_issue(v_revision_id);
  EXCEPTION WHEN object_not_in_prerequisite_state THEN
    v_raised := true;
  END;
  ASSERT v_raised, 'pending artifacts must block finalization';

  v_raised := false;
  BEGIN
    UPDATE public.spec_book_artifacts
    SET status = 'failed',
        error_code = 'not_rendered',
        error_message = 'Cannot fail before a render claim.'
    WHERE revision_id = v_revision_id AND audience = 'client';
  EXCEPTION WHEN object_not_in_prerequisite_state THEN
    v_raised := true;
  END;
  ASSERT v_raised, 'pending artifact must not skip directly to failed';

  FOR v_artifact IN
    SELECT * FROM public.spec_book_artifacts WHERE revision_id = v_revision_id
  LOOP
    UPDATE public.spec_book_artifacts
    SET status = 'rendering',
        attempt_count = attempt_count + 1,
        render_started_at = now(),
        rendered_at = NULL,
        error_code = NULL,
        error_message = NULL
    WHERE id = v_artifact.id;

    -- Exercise the renderer's failed-artifact retry path on one audience.
    IF v_artifact.audience = 'client' THEN
      UPDATE public.spec_book_artifacts
      SET status = 'failed',
          error_code = 'render_failed',
          error_message = 'Synthetic first-attempt failure.',
          rendered_at = NULL
      WHERE id = v_artifact.id;

      UPDATE public.spec_book_artifacts
      SET status = 'rendering',
          attempt_count = attempt_count + 1,
          render_started_at = now(),
          rendered_at = NULL,
          error_code = NULL,
          error_message = NULL
      WHERE id = v_artifact.id;
    END IF;

    INSERT INTO public.project_documents (
      project_id, title, doc_type, category, storage_path, size_bytes, version,
      status, uploaded_by, anchor_kind, section_key, client_visible
    )
    VALUES (
      '5b000000-0000-4000-8000-000000000101',
      'Spec Book ' || v_artifact.audience,
      'pdf',
      'spec',
      '5b000000-0000-4000-8000-000000000101/spec-' || v_artifact.audience || '.pdf',
      100,
      '1',
      'ready',
      '5b000000-0000-4000-8000-000000000001',
      'section',
      'spec-book',
      false
    )
    RETURNING id INTO v_document_id;

    UPDATE public.spec_book_artifacts
    SET status = 'ready',
        project_document_id = v_document_id,
        storage_path = '5b000000-0000-4000-8000-000000000101/spec-' || v_artifact.audience || '.pdf',
        checksum_sha256 = repeat('a', 64),
        size_bytes = 100,
        rendered_at = now()
    WHERE id = v_artifact.id;
  END LOOP;
  ASSERT (
    SELECT attempt_count = 2 FROM public.spec_book_artifacts
    WHERE revision_id = v_revision_id AND audience = 'client'
  ), 'failed artifact retry must reclaim the same artifact row';
  ASSERT (
    SELECT bool_and(
      CASE WHEN audience = 'client' THEN attempt_count = 2 ELSE attempt_count = 1 END
    )
    FROM public.spec_book_artifacts
    WHERE revision_id = v_revision_id
  ), 'valid pending/failed rendering claims must preserve audience artifacts';

  v_revision := public.finalize_spec_book_issue(v_revision_id);
  ASSERT v_revision.status = 'issued' AND v_revision.issued_at IS NOT NULL,
    'fully durable revision must issue';
  ASSERT (public.finalize_spec_book_issue(v_revision_id)).id = v_revision_id,
    'finalization must be idempotent';

  -- Hash-only valid share, wrong-audience denial, expiry, and revocation.
  v_share := public.create_spec_book_share(
    (
      SELECT id FROM public.spec_book_artifacts
      WHERE revision_id = v_revision_id AND audience = 'client'
    ),
    'Client copy',
    now() + interval '1 day'
  );
  v_token := v_share->>'token';
  ASSERT length(v_token) = 64, 'share must return a raw 64-hex token once';
  ASSERT (
    SELECT token_hash = encode(extensions.digest(v_token, 'sha256'), 'hex')
       AND token_hash <> v_token
    FROM public.document_shares WHERE id = (v_share->>'id')::uuid
  ), 'only sha256(raw token) may be stored';
  ASSERT public.resolve_spec_book_share(v_token)->>'audience' = 'client',
    'valid audience-bound share must resolve';
  ASSERT NOT (public.resolve_spec_book_share(v_token) ? 'storagePath')
      AND NOT (public.resolve_spec_book_share(v_token) ? 'renderSnapshot')
      AND position('tradePrice' IN public.resolve_spec_book_share(v_token)::text) = 0
      AND position('private' IN public.resolve_spec_book_share(v_token)::text) = 0,
    'share DTO must exclude raw paths, snapshots, trade pricing, and private notes';
  ASSERT NOT EXISTS (SELECT 1 FROM public.resolve_document_share(v_token)),
    'artifact token must not resolve through proposal share RPC';

  INSERT INTO public.document_shares (
    spec_book_artifact_id, token_hash, visibility, expires_at, created_by
  )
  VALUES (
    (SELECT id FROM public.spec_book_artifacts WHERE revision_id = v_revision_id AND audience = 'client'),
    encode(extensions.digest(v_bad_token, 'sha256'), 'hex'),
    '{"audience":"vendor","format":"pdf"}'::jsonb,
    now() + interval '1 day',
    '5b000000-0000-4000-8000-000000000001'
  );
  ASSERT public.resolve_spec_book_share(v_bad_token) IS NULL,
    'wrong-audience visibility must fail closed';

  UPDATE public.document_shares
  SET expires_at = now() - interval '1 second'
  WHERE id = (v_share->>'id')::uuid;
  ASSERT public.resolve_spec_book_share(v_token) IS NULL,
    'expired share must resolve NULL';
  UPDATE public.document_shares
  SET expires_at = now() + interval '1 day'
  WHERE id = (v_share->>'id')::uuid;
  ASSERT public.revoke_document_share((v_share->>'id')::uuid),
    'owner must revoke share';
  ASSERT public.resolve_spec_book_share(v_token) IS NULL,
    'revoked share must resolve NULL';

  -- Addendum revisions freeze the complete current set; renderer diffs it
  -- against the immutable base so true removals remain representable.
  UPDATE public.project_ffe_specs
  SET finish = 'Cerused walnut'
  WHERE ffe_item_id = '5b000000-0000-4000-8000-000000000501';
  UPDATE public.spec_book_item_settings s
  SET publication_overrides = jsonb_build_object('expectedRowVersion', sp.row_version)
  FROM public.project_ffe_specs sp
  WHERE s.ffe_item_id = sp.ffe_item_id
    AND s.spec_book_id = v_book.id;
  v_addendum := public.prepare_spec_book_issue(
    v_book.id,
    ARRAY['client'],
    'addendum',
    'Finish changed after issue.',
    v_revision_id,
    'issue-2-addendum',
    '[]'::jsonb
  );
  v_addendum_id := (v_addendum#>>'{revision,id}')::uuid;
  ASSERT jsonb_array_length(v_addendum#>'{revision,render_snapshot,items}') = 2,
    'addendum render snapshot must carry full current included-item set';
  ASSERT (
    SELECT count(*) = 2 FROM public.spec_book_revision_items
    WHERE revision_id = v_addendum_id
  ), 'addendum normalized rows must carry full current included-item set';

  RAISE NOTICE 'spec_books owner lifecycle assertions passed';
END
$$;

-- Triggers apply to the renderer's privileged client too: service_role can
-- advance valid lifecycle transitions, but cannot rewrite issued/ready truth.
SET LOCAL ROLE service_role;
DO $$
DECLARE
  v_revision_id uuid;
  v_artifact_id uuid;
  v_other_document_id uuid;
  v_original_path text;
  v_original_checksum text;
  v_original_document_id uuid;
  v_original_issued_at timestamptz;
  v_raised boolean;
BEGIN
  SELECT id, issued_at
    INTO v_revision_id, v_original_issued_at
  FROM public.spec_book_revisions
  WHERE idempotency_key = 'issue-1';

  SELECT id, project_document_id, storage_path, checksum_sha256
    INTO v_artifact_id, v_original_document_id, v_original_path, v_original_checksum
  FROM public.spec_book_artifacts
  WHERE revision_id = v_revision_id AND audience = 'client';

  SELECT project_document_id INTO v_other_document_id
  FROM public.spec_book_artifacts
  WHERE revision_id = v_revision_id AND audience = 'internal';

  v_raised := false;
  BEGIN
    UPDATE public.spec_book_revisions
    SET issued_at = issued_at + interval '1 minute'
    WHERE id = v_revision_id;
  EXCEPTION WHEN object_not_in_prerequisite_state THEN
    v_raised := true;
  END;
  ASSERT v_raised, 'service_role must not rewrite issued_at';

  v_raised := false;
  BEGIN
    UPDATE public.spec_book_revisions
    SET status = 'pending', issued_at = NULL
    WHERE id = v_revision_id;
  EXCEPTION WHEN object_not_in_prerequisite_state THEN
    v_raised := true;
  END;
  ASSERT v_raised, 'issued revision status must not regress';

  v_raised := false;
  BEGIN
    UPDATE public.spec_book_revisions
    SET reason = 'tampered after issue'
    WHERE id = v_revision_id;
  EXCEPTION WHEN object_not_in_prerequisite_state THEN
    v_raised := true;
  END;
  ASSERT v_raised, 'service_role must not rewrite issued issue metadata';

  v_raised := false;
  BEGIN
    UPDATE public.spec_book_revisions
    SET render_snapshot = render_snapshot || '{"tampered":true}'::jsonb
    WHERE id = v_revision_id;
  EXCEPTION WHEN object_not_in_prerequisite_state THEN
    v_raised := true;
  END;
  ASSERT v_raised, 'service_role must not rewrite issued render snapshots';

  v_raised := false;
  BEGIN
    UPDATE public.spec_book_artifacts
    SET revision_id = extensions.gen_random_uuid()
    WHERE id = v_artifact_id;
  EXCEPTION WHEN object_not_in_prerequisite_state THEN
    v_raised := true;
  END;
  ASSERT v_raised, 'artifact revision identity must be immutable';

  v_raised := false;
  BEGIN
    UPDATE public.spec_book_artifacts SET audience = 'care'
    WHERE id = v_artifact_id;
  EXCEPTION WHEN object_not_in_prerequisite_state THEN
    v_raised := true;
  END;
  ASSERT v_raised, 'artifact audience identity must be immutable';

  v_raised := false;
  BEGIN
    UPDATE public.spec_book_artifacts SET format = 'docx'
    WHERE id = v_artifact_id;
  EXCEPTION WHEN object_not_in_prerequisite_state THEN
    v_raised := true;
  END;
  ASSERT v_raised, 'artifact format identity must be immutable';

  v_raised := false;
  BEGIN
    UPDATE public.spec_book_artifacts SET id = id
    WHERE id = v_artifact_id;
  EXCEPTION WHEN object_not_in_prerequisite_state THEN
    v_raised := true;
  END;
  ASSERT v_raised, 'service_role no-op updates must not touch ready artifacts';

  v_raised := false;
  BEGIN
    UPDATE public.spec_book_artifacts SET status = 'failed'
    WHERE id = v_artifact_id;
  EXCEPTION WHEN object_not_in_prerequisite_state THEN
    v_raised := true;
  END;
  ASSERT v_raised, 'ready artifact status must not regress';

  v_raised := false;
  BEGIN
    UPDATE public.spec_book_artifacts SET storage_path = storage_path || '.tampered'
    WHERE id = v_artifact_id;
  EXCEPTION WHEN object_not_in_prerequisite_state THEN
    v_raised := true;
  END;
  ASSERT v_raised, 'ready artifact storage path must be immutable';

  v_raised := false;
  BEGIN
    UPDATE public.spec_book_artifacts SET project_document_id = v_other_document_id
    WHERE id = v_artifact_id;
  EXCEPTION WHEN object_not_in_prerequisite_state THEN
    v_raised := true;
  END;
  ASSERT v_raised, 'ready artifact document link must be immutable';

  v_raised := false;
  BEGIN
    UPDATE public.spec_book_artifacts SET checksum_sha256 = repeat('b', 64)
    WHERE id = v_artifact_id;
  EXCEPTION WHEN object_not_in_prerequisite_state THEN
    v_raised := true;
  END;
  ASSERT v_raised, 'ready artifact checksum must be immutable';

  ASSERT (
    SELECT issued_at = v_original_issued_at
    FROM public.spec_book_revisions WHERE id = v_revision_id
  ), 'issued revision timestamp must remain unchanged after denied writes';
  ASSERT (
    SELECT status = 'ready'
       AND storage_path = v_original_path
       AND project_document_id = v_original_document_id
       AND checksum_sha256 = v_original_checksum
    FROM public.spec_book_artifacts WHERE id = v_artifact_id
  ), 'ready artifact durable identity must remain unchanged after denied writes';

  RAISE NOTICE 'spec_books service-role immutability assertions passed';
END
$$;
RESET ROLE;

-- Non-owner RPC denial + RLS invisibility under the actual authenticated role.
DO $$
DECLARE
  v_book_id uuid;
  v_artifact_id uuid;
  v_count integer;
  v_raised boolean;
BEGIN
  SELECT id INTO v_book_id FROM public.spec_books
  WHERE project_id = '5b000000-0000-4000-8000-000000000101';
  SELECT a.id INTO v_artifact_id
  FROM public.spec_book_artifacts a
  JOIN public.spec_book_revisions r ON r.id = a.revision_id
  WHERE r.spec_book_id = v_book_id
  LIMIT 1;

  PERFORM pg_temp.assume_user('5b000000-0000-4000-8000-000000000002');
  v_raised := false;
  BEGIN
    PERFORM public.ensure_project_spec_book('5b000000-0000-4000-8000-000000000101');
  EXCEPTION WHEN insufficient_privilege THEN v_raised := true;
  END;
  ASSERT v_raised, 'non-owner must not ensure another project book';

  v_raised := false;
  BEGIN
    PERFORM public.place_product_in_project(
      '5b000000-0000-4000-8000-000000000101',
      '5b000000-0000-4000-8000-000000000401',
      NULL, NULL, NULL, '{}'::jsonb
    );
  EXCEPTION WHEN insufficient_privilege THEN v_raised := true;
  END;
  ASSERT v_raised, 'non-owner must not place into another project';

  v_raised := false;
  BEGIN
    PERFORM public.prepare_spec_book_issue(
      v_book_id, ARRAY['client'], 'full', NULL, NULL, 'outsider', '[]'::jsonb
    );
  EXCEPTION WHEN insufficient_privilege THEN v_raised := true;
  END;
  ASSERT v_raised, 'non-owner must not prepare another project book';

  v_raised := false;
  BEGIN
    PERFORM public.create_spec_book_share(v_artifact_id, 'stolen', NULL);
  EXCEPTION WHEN insufficient_privilege THEN v_raised := true;
  END;
  ASSERT v_raised, 'non-owner must not share another project artifact';

  PERFORM pg_temp.assume_user_role('5b000000-0000-4000-8000-000000000002');
  SELECT count(*) INTO v_count FROM public.spec_books WHERE id = v_book_id;
  ASSERT v_count = 0, 'RLS must hide working book from outsider';
  SELECT count(*) INTO v_count FROM public.spec_book_revisions
  WHERE spec_book_id = v_book_id;
  ASSERT v_count = 0, 'RLS must hide revision headers from outsider';
  SELECT count(*) INTO v_count FROM public.spec_book_artifacts
  WHERE id = v_artifact_id;
  ASSERT v_count = 0, 'RLS must hide artifacts from outsider';
  SELECT count(*) INTO v_count FROM public.document_shares
  WHERE spec_book_artifact_id = v_artifact_id;
  ASSERT v_count = 0, 'RLS must hide artifact share records from outsider';
  PERFORM pg_temp.reset_user_role();

  -- Even the project's authenticated client gets no working/revision table
  -- path; client access is only the immutable artifact share resolver.
  PERFORM pg_temp.assume_user_role('5b000000-0000-4000-8000-000000000003');
  SELECT count(*) INTO v_count FROM public.spec_books WHERE id = v_book_id;
  ASSERT v_count = 0, 'project client must not read working book';
  SELECT count(*) INTO v_count FROM public.spec_book_revisions
  WHERE spec_book_id = v_book_id;
  ASSERT v_count = 0, 'project client must not read revision rows';
  SELECT count(*) INTO v_count FROM public.spec_book_artifacts
  WHERE id = v_artifact_id;
  ASSERT v_count = 0, 'project client must not read artifact table directly';
  PERFORM pg_temp.reset_user_role();

  RAISE NOTICE 'spec_books non-owner/RLS assertions passed';
END
$$;

ROLLBACK;
