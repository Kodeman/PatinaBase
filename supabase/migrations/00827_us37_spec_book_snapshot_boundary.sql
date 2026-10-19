-- 00827 — Freeze chapter and item membership in one statement (SQ-1301).
-- Lineage: 00380 prepare_spec_book_issue → 00403 renamed core → 00511
-- search_path hardening. The public 00511 authorization/configuration wrapper
-- and the latest 00818 STABLE item builder remain unchanged.
-- Revision-item rows reuse the captured items rather than rereading live state.
-- No historical revision, eligibility predicate, signature or ACL is changed.

CREATE OR REPLACE FUNCTION public._prepare_spec_book_issue_00403(
  p_spec_book_id uuid,
  p_audiences text[],
  p_issue_type text,
  p_reason text,
  p_base_revision_id uuid,
  p_idempotency_key text,
  p_warning_acknowledgements jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions, pg_temp
AS $$
DECLARE
  v_book public.spec_books;
  v_project public.projects;
  v_template public.spec_book_templates;
  v_existing public.spec_book_revisions;
  v_revision public.spec_book_revisions;
  v_prior_revision_id uuid;
  v_revision_number integer;
  v_audiences text[];
  v_blockers jsonb := '[]'::jsonb;
  v_warnings jsonb := '[]'::jsonb;
  v_chapters jsonb := '[]'::jsonb;
  v_fixed jsonb := '[]'::jsonb;
  v_allowances jsonb := '[]'::jsonb;
  v_tbd jsonb := '[]'::jsonb;
  v_revision_items jsonb := '[]'::jsonb;
  v_render_snapshot jsonb;
  v_template_snapshot jsonb;
  v_item record;
  v_setting record;
  v_warning jsonb;
  v_count integer;
  v_artifacts jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING errcode = 'insufficient_privilege';
  END IF;
  IF p_idempotency_key IS NULL OR length(btrim(p_idempotency_key)) = 0 THEN
    RAISE EXCEPTION 'idempotency key is required' USING errcode = 'check_violation';
  END IF;
  IF p_warning_acknowledgements IS NULL
     OR jsonb_typeof(p_warning_acknowledgements) <> 'array' THEN
    RAISE EXCEPTION 'warning acknowledgements must be an array'
      USING errcode = 'check_violation';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_warning_acknowledgements) ack
    WHERE jsonb_typeof(ack) <> 'object'
       OR length(btrim(COALESCE(ack->>'id', ''))) = 0
       OR length(btrim(COALESCE(ack->>'reason', ''))) = 0
  ) THEN
    RAISE EXCEPTION 'every warning acknowledgement requires id and reason'
      USING errcode = 'check_violation';
  END IF;

  SELECT * INTO v_book
  FROM public.spec_books
  WHERE id = p_spec_book_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'spec book not found' USING errcode = 'no_data_found';
  END IF;
  SELECT * INTO v_project FROM public.projects WHERE id = v_book.project_id;
  IF NOT public.is_studio_comember(v_project.designer_id) THEN
    RAISE EXCEPTION 'spec book not accessible' USING errcode = 'insufficient_privilege';
  END IF;
  SELECT * INTO v_template FROM public.spec_book_templates WHERE id = v_book.template_id;

  SELECT array_agg(a ORDER BY a) INTO v_audiences
  FROM (SELECT DISTINCT unnest(p_audiences) AS a) deduped;
  IF v_audiences IS NULL
     OR cardinality(v_audiences) = 0
     OR NOT (v_audiences <@ ARRAY['client','vendor','installer','internal','care']::text[]) THEN
    RAISE EXCEPTION 'one or more supported audiences are required'
      USING errcode = 'check_violation';
  END IF;
  IF p_issue_type NOT IN ('full','replacement','addendum') THEN
    RAISE EXCEPTION 'unsupported issue type' USING errcode = 'check_violation';
  END IF;

  SELECT * INTO v_existing
  FROM public.spec_book_revisions
  WHERE spec_book_id = p_spec_book_id
    AND idempotency_key = p_idempotency_key;
  IF FOUND THEN
    IF v_existing.issue_type IS DISTINCT FROM p_issue_type
       OR v_existing.base_revision_id IS DISTINCT FROM p_base_revision_id
       OR v_existing.requested_audiences IS DISTINCT FROM v_audiences
       OR v_existing.reason IS DISTINCT FROM NULLIF(btrim(p_reason), '') THEN
      RAISE EXCEPTION 'idempotency key was reused with a different request'
        USING errcode = 'unique_violation';
    END IF;
    SELECT COALESCE(jsonb_agg(to_jsonb(a) ORDER BY a.audience), '[]'::jsonb)
      INTO v_artifacts
    FROM public.spec_book_artifacts a
    WHERE a.revision_id = v_existing.id;
    RETURN jsonb_build_object(
      'revision', to_jsonb(v_existing),
      'artifacts', v_artifacts,
      'warnings', '[]'::jsonb,
      'idempotent', true
    );
  END IF;

  SELECT id INTO v_prior_revision_id
  FROM public.spec_book_revisions
  WHERE spec_book_id = p_spec_book_id AND status = 'issued'
  ORDER BY revision_number DESC
  LIMIT 1;

  IF p_issue_type = 'full' AND p_base_revision_id IS NOT NULL THEN
    RAISE EXCEPTION 'full issue cannot name a base revision'
      USING errcode = 'check_violation';
  END IF;
  IF p_issue_type IN ('replacement','addendum') THEN
    IF p_base_revision_id IS NULL OR length(btrim(COALESCE(p_reason, ''))) = 0 THEN
      RAISE EXCEPTION 'replacement/addendum requires an issued base and reason'
        USING errcode = 'check_violation';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.spec_book_revisions
      WHERE id = p_base_revision_id
        AND spec_book_id = p_spec_book_id
        AND status = 'issued'
    ) THEN
      RAISE EXCEPTION 'base revision is not an issued revision of this book'
        USING errcode = 'check_violation';
    END IF;
  END IF;

  -- Duplicate non-empty document codes.
  FOR v_item IN
    SELECT upper(btrim(document_code)) AS code, count(*) AS n
    FROM public._spec_book_current_item_snapshots(p_spec_book_id)
    WHERE NULLIF(btrim(document_code), '') IS NOT NULL
    GROUP BY upper(btrim(document_code))
    HAVING count(*) > 1
  LOOP
    v_blockers := v_blockers || jsonb_build_array(jsonb_build_object(
      'code', 'duplicate_document_code', 'documentCode', v_item.code, 'count', v_item.n
    ));
  END LOOP;

  SELECT count(*) INTO v_count
  FROM public._spec_book_current_item_snapshots(p_spec_book_id);
  IF v_count > COALESCE((v_template.layout_settings->>'maxItems')::integer, 500) THEN
    v_blockers := v_blockers || jsonb_build_array(jsonb_build_object(
      'code', 'book_item_limit_exceeded',
      'count', v_count,
      'limit', COALESCE((v_template.layout_settings->>'maxItems')::integer, 500)
    ));
  END IF;

  -- Per-line preflight and warnings.
  FOR v_item IN
    SELECT * FROM public._spec_book_current_item_snapshots(p_spec_book_id)
  LOOP
    IF v_item.item_type = 'fixed' THEN
      IF length(btrim(COALESCE(v_item.item_snapshot->>'name', ''))) = 0 THEN
        v_blockers := v_blockers || jsonb_build_array(jsonb_build_object(
          'code','missing_name','ffeItemId',v_item.ffe_item_id
        ));
      END IF;
      IF length(btrim(COALESCE(v_item.document_code, ''))) = 0 THEN
        v_blockers := v_blockers || jsonb_build_array(jsonb_build_object(
          'code','missing_document_code','ffeItemId',v_item.ffe_item_id
        ));
      END IF;
      IF v_item.item_snapshot#>>'{room,id}' IS NULL THEN
        v_blockers := v_blockers || jsonb_build_array(jsonb_build_object(
          'code','missing_room','ffeItemId',v_item.ffe_item_id
        ));
      END IF;
      IF COALESCE((v_item.item_snapshot->>'quantity')::integer, 0) <= 0 THEN
        v_blockers := v_blockers || jsonb_build_array(jsonb_build_object(
          'code','invalid_quantity','ffeItemId',v_item.ffe_item_id
        ));
      END IF;
      IF jsonb_array_length(COALESCE(v_item.item_snapshot->'selectedMedia', '[]'::jsonb)) = 0 THEN
        v_blockers := v_blockers || jsonb_build_array(jsonb_build_object(
          'code','missing_image','ffeItemId',v_item.ffe_item_id
        ));
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM jsonb_each(v_item.item_snapshot->'selection') f
        WHERE f.value->'value' <> 'null'::jsonb
           OR COALESCE((f.value->>'na')::boolean, false)
      ) THEN
        v_blockers := v_blockers || jsonb_build_array(jsonb_build_object(
          'code','missing_selection','ffeItemId',v_item.ffe_item_id
        ));
      END IF;
      IF 'vendor' = ANY(v_audiences)
         AND v_item.item_snapshot#>>'{vendor,id}' IS NULL
         AND length(btrim(COALESCE(v_item.item_snapshot#>>'{vendor,name}', ''))) = 0 THEN
        v_blockers := v_blockers || jsonb_build_array(jsonb_build_object(
          'code','missing_vendor_fact','ffeItemId',v_item.ffe_item_id
        ));
      END IF;
      IF 'installer' = ANY(v_audiences)
         AND v_item.item_snapshot#>'{selection,exactLocation,value}' = 'null'::jsonb
         AND NOT COALESCE((v_item.item_snapshot#>>'{selection,exactLocation,na}')::boolean, false) THEN
        v_blockers := v_blockers || jsonb_build_array(jsonb_build_object(
          'code','missing_install_location','ffeItemId',v_item.ffe_item_id
        ));
      END IF;
      IF 'installer' = ANY(v_audiences)
         AND length(btrim(COALESCE(v_item.item_snapshot#>>'{notes,install}', ''))) = 0 THEN
        v_blockers := v_blockers || jsonb_build_array(jsonb_build_object(
          'code','missing_install_notes','ffeItemId',v_item.ffe_item_id
        ));
      END IF;
    END IF;

    IF length(btrim(COALESCE(v_item.item_snapshot#>>'{notes,client}', ''))) = 0 THEN
      v_warnings := v_warnings || jsonb_build_array(jsonb_build_object(
        'id','missing-client-note:' || v_item.ffe_item_id::text,
        'code','missing_optional_note','ffeItemId',v_item.ffe_item_id
      ));
    END IF;
    IF EXISTS (
      SELECT 1
      FROM jsonb_each_text(COALESCE(v_item.item_snapshot->'sourceVerification', '{}'::jsonb)) sv
      WHERE sv.value ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T'
        AND sv.value::timestamptz < now() - interval '180 days'
    ) THEN
      v_warnings := v_warnings || jsonb_build_array(jsonb_build_object(
        'id','stale-source:' || v_item.ffe_item_id::text,
        'code','stale_source_verification','ffeItemId',v_item.ffe_item_id
      ));
    END IF;
  END LOOP;

  -- Structural ownership/version checks are repeated here even though write
  -- triggers reject bad links, so preflight fails closed against legacy/manual
  -- rows and optimistic clients.
  FOR v_setting IN
    SELECT s.*, i.project_id, sp.row_version
    FROM public.spec_book_item_settings s
    JOIN public.project_ffe_items i ON i.id = s.ffe_item_id
    JOIN public.project_ffe_specs sp ON sp.ffe_item_id = i.id
    WHERE s.spec_book_id = p_spec_book_id AND s.included
  LOOP
    IF v_setting.project_id <> v_book.project_id THEN
      v_blockers := v_blockers || jsonb_build_array(jsonb_build_object(
        'code','invalid_item_ownership','ffeItemId',v_setting.ffe_item_id
      ));
    END IF;
    IF v_setting.publication_overrides ? 'expectedRowVersion'
       AND (v_setting.publication_overrides->>'expectedRowVersion')::integer <> v_setting.row_version THEN
      v_blockers := v_blockers || jsonb_build_array(jsonb_build_object(
        'code','row_version_conflict','ffeItemId',v_setting.ffe_item_id,
        'expected',v_setting.publication_overrides->>'expectedRowVersion',
        'actual',v_setting.row_version
      ));
    END IF;
    IF (
      ('client' = ANY(v_audiences) OR 'care' = ANY(v_audiences))
      AND public._spec_book_has_forbidden_keys(
        v_setting.publication_overrides,
        ARRAY[
          'tradePrice','tradePriceCents','trade_price_cents','markup','markupPercent',
          'privateNotes','private_notes','tradeNotes','trade_notes','vendorContact',
          'vendor_contact','procurementNotes','procurement_notes','installNotes'
        ]::text[]
      )
    ) THEN
      v_blockers := v_blockers || jsonb_build_array(jsonb_build_object(
        'code','audience_privacy_violation','ffeItemId',v_setting.ffe_item_id
      ));
    END IF;
  END LOOP;

  IF jsonb_array_length(v_blockers) > 0 THEN
    RAISE EXCEPTION 'spec_book_preflight_failed'
      USING errcode = 'check_violation',
            detail = jsonb_build_object('blockers', v_blockers, 'warnings', v_warnings)::text;
  END IF;

  -- Every warning on an issue attempt must be explicitly acknowledged with a
  -- reason; acknowledgement records are frozen on the revision.
  FOR v_warning IN SELECT value FROM jsonb_array_elements(v_warnings)
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(p_warning_acknowledgements) ack
      WHERE ack->>'id' = v_warning->>'id'
        AND length(btrim(COALESCE(ack->>'reason',''))) > 0
    ) THEN
      RAISE EXCEPTION 'spec_book_warnings_unacknowledged'
        USING errcode = 'check_violation',
              detail = jsonb_build_object('warnings', v_warnings)::text;
    END IF;
  END LOOP;

  -- The STABLE item builder and chapters must share this statement's MVCC
  -- snapshot: a chapter toggle must not freeze an item without its chapter.
  SELECT
    COALESCE(jsonb_agg(item_snapshot || jsonb_build_object('contentHash', content_hash)
      ORDER BY chapter_position, item_position, ffe_item_id)
      FILTER (WHERE item_type = 'fixed'), '[]'::jsonb),
    COALESCE(jsonb_agg(item_snapshot || jsonb_build_object('contentHash', content_hash)
      ORDER BY chapter_position, item_position, ffe_item_id)
      FILTER (WHERE item_type = 'allowance'), '[]'::jsonb),
    COALESCE(jsonb_agg(item_snapshot || jsonb_build_object('contentHash', content_hash)
      ORDER BY chapter_position, item_position, ffe_item_id)
      FILTER (WHERE item_type = 'tbd'), '[]'::jsonb),
    (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', c.id,
        'projectRoomId', c.project_room_id,
        'title', c.title,
        'position', c.position,
        'heroMedia', c.hero_media,
        'pageTemplate', c.page_template,
        'reviewState', c.review_state
      ) ORDER BY c.position, c.id), '[]'::jsonb)
      FROM public.spec_book_chapters c
      WHERE c.spec_book_id = p_spec_book_id AND c.included
    ),
    COALESCE(jsonb_agg(to_jsonb(cur)), '[]'::jsonb)
  INTO v_fixed, v_allowances, v_tbd, v_chapters, v_revision_items
  FROM public._spec_book_current_item_snapshots(p_spec_book_id) cur;

  v_template_snapshot := to_jsonb(v_template);
  v_render_snapshot := jsonb_build_object(
    'contractVersion', 1,
    'book', jsonb_build_object(
      'id', v_book.id, 'projectId', v_book.project_id, 'title', v_book.title,
      'settings', v_book.settings
    ),
    'project', jsonb_build_object(
      'id', v_project.id, 'name', v_project.name, 'siteAddress', v_project.site_address
    ),
    'template', v_template_snapshot,
    'chapters', v_chapters,
    'items', v_fixed,
    'allowances', v_allowances,
    'tbd', v_tbd,
    'audiences', to_jsonb(v_audiences),
    'issue', jsonb_build_object(
      'type', p_issue_type,
      'reason', NULLIF(btrim(p_reason), ''),
      'baseRevisionId', p_base_revision_id
    )
  );

  SELECT COALESCE(max(revision_number), 0) + 1 INTO v_revision_number
  FROM public.spec_book_revisions WHERE spec_book_id = p_spec_book_id;

  INSERT INTO public.spec_book_revisions (
    spec_book_id, revision_number, idempotency_key, issue_type,
    prior_revision_id, base_revision_id, reason, status, requested_audiences,
    warning_acknowledgements, template_snapshot, render_snapshot,
    snapshot_checksum, created_by
  )
  VALUES (
    p_spec_book_id, v_revision_number, p_idempotency_key, p_issue_type,
    v_prior_revision_id, p_base_revision_id, NULLIF(btrim(p_reason), ''),
    'pending', v_audiences, p_warning_acknowledgements,
    v_template_snapshot, v_render_snapshot,
    encode(
      extensions.digest(public._spec_book_canonical_json(v_render_snapshot), 'sha256'),
      'hex'
    ),
    auth.uid()
  )
  RETURNING * INTO v_revision;

  INSERT INTO public.spec_book_revision_items (
    revision_id, ffe_item_id, item_type, document_code, chapter_position,
    item_position, item_snapshot, content_hash
  )
  SELECT
    v_revision.id, cur.ffe_item_id, cur.item_type, cur.document_code,
    cur.chapter_position, cur.item_position, cur.item_snapshot, cur.content_hash
  FROM jsonb_to_recordset(v_revision_items) AS cur(
    ffe_item_id uuid, item_type text, document_code text,
    chapter_position integer, item_position integer,
    item_snapshot jsonb, content_hash text
  );

  INSERT INTO public.spec_book_artifacts (revision_id, audience)
  SELECT v_revision.id, unnest(v_audiences);

  SELECT COALESCE(jsonb_agg(to_jsonb(a) ORDER BY a.audience), '[]'::jsonb)
    INTO v_artifacts
  FROM public.spec_book_artifacts a
  WHERE a.revision_id = v_revision.id;

  RETURN jsonb_build_object(
    'revision', to_jsonb(v_revision),
    'artifacts', v_artifacts,
    'warnings', v_warnings,
    'idempotent', false
  );
END;
$$;

