-- Materialized 2026-08-12 from Strata's migration ledger (applied out-of-band; git had no source file). Do not re-run manually.

-- 00449 — Close final direct-probe gaps in PO authority and review media freezing.

ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS needs_repricing boolean NOT NULL DEFAULT false;

UPDATE public.purchase_orders SET created_by = designer_id WHERE created_by IS NULL;

CREATE TABLE public.project_review_board_media_assets (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  edition_id uuid NOT NULL REFERENCES public.project_review_editions(id) ON DELETE RESTRICT,
  board_id uuid NOT NULL REFERENCES public.proposal_boards(id) ON DELETE RESTRICT,
  placement_id uuid REFERENCES public.proposal_board_items(id) ON DELETE RESTRICT,
  media_role text NOT NULL CHECK (media_role IN ('cover', 'reference')),
  asset_id uuid NOT NULL REFERENCES public.project_review_media_assets(id) ON DELETE RESTRICT,
  derivative_kind text NOT NULL,
  storage_bucket text NOT NULL,
  storage_path text NOT NULL,
  checksum_sha256 text NOT NULL CHECK (checksum_sha256 ~ '^[0-9a-f]{64}$'),
  size_bytes bigint NOT NULL CHECK (size_bytes >= 0),
  content_type text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE NULLS NOT DISTINCT (edition_id, board_id, placement_id, media_role)
);

ALTER TABLE public.project_review_board_media_assets ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.project_review_board_media_assets
  FROM PUBLIC, anon, authenticated, service_role;

ALTER TABLE public.proposal_boards
  ADD COLUMN IF NOT EXISTS cover_review_media_asset_id uuid
    REFERENCES public.project_review_media_assets(id) ON DELETE RESTRICT;

ALTER TABLE public.proposal_board_items
  ADD COLUMN IF NOT EXISTS review_media_asset_id uuid
    REFERENCES public.project_review_media_assets(id) ON DELETE RESTRICT;

CREATE OR REPLACE FUNCTION public.guard_purchase_order_change_immutable()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public', 'pg_temp' AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'purchase order change records are immutable'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.project_id IS DISTINCT FROM OLD.project_id
     OR NEW.purchase_order_id IS DISTINCT FROM OLD.purchase_order_id
     OR NEW.project_ffe_item_id IS DISTINCT FROM OLD.project_ffe_item_id
     OR NEW.change_kind IS DISTINCT FROM OLD.change_kind
     OR NEW.reason IS DISTINCT FROM OLD.reason
     OR NEW.prior_snapshot IS DISTINCT FROM OLD.prior_snapshot
     OR NEW.requested_vendor_id IS DISTINCT FROM OLD.requested_vendor_id
     OR NEW.created_by IS DISTINCT FROM OLD.created_by
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR (
       NEW.replacement_purchase_order_id IS DISTINCT FROM OLD.replacement_purchase_order_id
       AND NOT (
         current_setting('app.po_change_replacement_link', true) = 'on'
         AND OLD.replacement_purchase_order_id IS NULL
         AND NEW.replacement_purchase_order_id IS NOT NULL
         AND EXISTS (
           SELECT 1 FROM public.purchase_orders replacement
           WHERE replacement.id = NEW.replacement_purchase_order_id
             AND replacement.project_id = OLD.project_id
         )
       )
     )
  THEN
    RAISE EXCEPTION 'purchase order change evidence is immutable'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_purchase_order_repricing()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public', 'pg_temp' AS $$
BEGIN
  IF OLD.needs_repricing AND NEW.status NOT IN ('draft', 'cancelled') THEN
    RAISE EXCEPTION 'replacement purchase order must be repriced before release'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_purchase_order_repricing_trg ON public.purchase_orders;

CREATE TRIGGER guard_purchase_order_repricing_trg
BEFORE UPDATE OF status ON public.purchase_orders
FOR EACH ROW EXECUTE FUNCTION public.guard_purchase_order_repricing();

ALTER FUNCTION public.create_purchase_order(
  uuid, uuid, public.purchase_order_payment_pattern, uuid[], text, date,
  boolean, date, integer, jsonb, text, text
) RENAME TO _create_purchase_order_00448_impl;

REVOKE ALL ON FUNCTION public._create_purchase_order_00448_impl(
  uuid, uuid, public.purchase_order_payment_pattern, uuid[], text, date,
  boolean, date, integer, jsonb, text, text
) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.create_purchase_order(
  p_project_id uuid, p_vendor_id uuid,
  p_payment_pattern public.purchase_order_payment_pattern, p_ffe_item_ids uuid[],
  p_vendor_po_number text DEFAULT NULL, p_confirmed_eta date DEFAULT NULL,
  p_is_patina_catalog boolean DEFAULT false, p_deposit_due_date date DEFAULT NULL,
  p_deposit_amount_cents integer DEFAULT NULL,
  p_custom_milestones jsonb DEFAULT '[]'::jsonb,
  p_sidemark text DEFAULT NULL, p_notes text DEFAULT NULL
)
RETURNS public.purchase_orders
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_owner uuid;
  v_previous_claims text := current_setting('request.jwt.claims', true);
  v_previous_sub text := current_setting('request.jwt.claim.sub', true);
  v_po public.purchase_orders%ROWTYPE;
BEGIN
  PERFORM public._ffe_require_studio_project(p_project_id);
  SELECT designer_id INTO STRICT v_owner FROM public.projects WHERE id = p_project_id;
  IF COALESCE(cardinality(p_ffe_item_ids), 0) = 0 OR (
    SELECT count(*) FROM public.project_ffe_items item
    WHERE item.id = ANY(p_ffe_item_ids) AND item.project_id = p_project_id
      AND item.vendor_id = p_vendor_id AND item.removed_at IS NULL
      AND item.design_disposition = 'selected'
  ) <> cardinality(p_ffe_item_ids) THEN
    RAISE EXCEPTION 'every PO line must be an active selected line for the PO project and vendor'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  PERFORM set_config('request.jwt.claims',
    jsonb_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', v_owner::text, true);
  PERFORM set_config('app.ffe_mutation_rpc', 'on', true);
  v_po := public._create_purchase_order_v1_impl(
    p_project_id, p_vendor_id, p_payment_pattern, p_ffe_item_ids,
    p_vendor_po_number, p_confirmed_eta, p_is_patina_catalog,
    p_deposit_due_date, p_deposit_amount_cents, p_custom_milestones,
    p_sidemark, p_notes
  );
  PERFORM set_config('request.jwt.claims', COALESCE(v_previous_claims, ''), true);
  PERFORM set_config('request.jwt.claim.sub', COALESCE(v_previous_sub, ''), true);
  UPDATE public.purchase_orders SET created_by = v_actor WHERE id = v_po.id
  RETURNING * INTO v_po;
  RETURN v_po;
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('request.jwt.claims', COALESCE(v_previous_claims, ''), true);
  PERFORM set_config('request.jwt.claim.sub', COALESCE(v_previous_sub, ''), true);
  RAISE;
END;
$$;

CREATE OR REPLACE FUNCTION public.start_purchase_order_change(p_request jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $$
DECLARE
  v_po public.purchase_orders%ROWTYPE;
  v_item_id uuid := CASE WHEN p_request->>'selectionId' ~* '^[0-9a-f-]{36}$'
    THEN (p_request->>'selectionId')::uuid END;
  v_vendor_id uuid := CASE WHEN p_request->>'replacementVendorId' ~* '^[0-9a-f-]{36}$'
    THEN (p_request->>'replacementVendorId')::uuid END;
  v_kind text := p_request->>'changeKind';
  v_reason text := btrim(COALESCE(p_request->>'reason', ''));
  v_rebuildable boolean;
  v_line_ids uuid[];
  v_lines jsonb;
  v_change public.purchase_order_changes%ROWTYPE;
  v_replacement public.purchase_orders%ROWTYPE;
BEGIN
  SELECT * INTO v_po FROM public.purchase_orders
  WHERE id = NULLIF(p_request->>'purchaseOrderId', '')::uuid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'purchase order not found' USING ERRCODE = 'no_data_found'; END IF;
  PERFORM public._ffe_require_studio_project(v_po.project_id);
  IF v_kind NOT IN ('vendor_change','cancellation','credit','claim','remedy','new_scope')
     OR char_length(v_reason) < 5 THEN
    RAISE EXCEPTION 'invalid purchase order change' USING ERRCODE = 'check_violation';
  END IF;
  IF v_kind = 'vendor_change' AND (
    v_vendor_id IS NULL OR v_vendor_id = v_po.vendor_id
    OR NOT EXISTS (SELECT 1 FROM public.vendors WHERE id = v_vendor_id)
  ) THEN
    RAISE EXCEPTION 'vendor change requires a different valid vendor'
      USING ERRCODE = 'check_violation';
  END IF;
  PERFORM 1 FROM public.project_ffe_items item
  WHERE item.purchase_order_id = v_po.id ORDER BY item.id FOR UPDATE;
  SELECT array_agg(item.id ORDER BY item.id), jsonb_agg(to_jsonb(item) ORDER BY item.id)
  INTO v_line_ids, v_lines FROM public.project_ffe_items item
  WHERE item.purchase_order_id = v_po.id;
  IF v_item_id IS NOT NULL AND NOT (v_item_id = ANY(COALESCE(v_line_ids, '{}'))) THEN
    RAISE EXCEPTION 'selection is not a line on the purchase order'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  v_rebuildable := v_po.status = 'draft' AND v_po.sent_at IS NULL
    AND v_po.acknowledged_at IS NULL AND NOT EXISTS (
      SELECT 1 FROM public.po_payments payment
      WHERE payment.purchase_order_id = v_po.id AND payment.state = 'paid'
    );
  INSERT INTO public.purchase_order_changes(
    project_id, purchase_order_id, project_ffe_item_id, change_kind, reason,
    prior_snapshot, requested_vendor_id, created_by
  ) VALUES (
    v_po.project_id, v_po.id, v_item_id, v_kind, v_reason,
    jsonb_build_object('purchaseOrder', to_jsonb(v_po), 'lines', COALESCE(v_lines, '[]'::jsonb)),
    v_vendor_id, auth.uid()
  ) RETURNING * INTO v_change;
  IF v_rebuildable AND v_kind IN ('vendor_change', 'cancellation') THEN
    PERFORM set_config('app.ffe_mutation_rpc', 'on', true);
    UPDATE public.project_ffe_items SET purchase_order_id = NULL, updated_at = now()
    WHERE id = ANY(COALESCE(v_line_ids, '{}'));
    UPDATE public.purchase_orders SET status = 'cancelled', updated_at = now() WHERE id = v_po.id;
    IF v_kind = 'vendor_change' THEN
      UPDATE public.project_ffe_items item
      SET vendor_id = v_vendor_id, vendor_name = vendor.name, updated_at = now()
      FROM public.vendors vendor WHERE item.id = ANY(v_line_ids) AND vendor.id = v_vendor_id;
      v_replacement := public.create_purchase_order(
        v_po.project_id, v_vendor_id, v_po.payment_pattern, v_line_ids,
        NULL, v_po.confirmed_eta, v_po.is_patina_catalog,
        NULL, NULL, '[]'::jsonb, v_po.sidemark, v_po.notes
      );
      UPDATE public.purchase_orders SET needs_repricing = true WHERE id = v_replacement.id;
      PERFORM set_config('app.po_change_replacement_link', 'on', true);
      UPDATE public.purchase_order_changes
      SET replacement_purchase_order_id = v_replacement.id WHERE id = v_change.id;
    END IF;
  END IF;
  RETURN jsonb_build_object(
    'changeId', v_change.id, 'purchaseOrderId', v_po.id,
    'rebuildable', v_rebuildable, 'requiresImmutableFollowup', NOT v_rebuildable,
    'replacementVendorId', v_vendor_id, 'replacementPoId', v_replacement.id,
    'needsRepricing', COALESCE(v_replacement.needs_repricing, false)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.log_po_acknowledgment(
  p_po_id uuid, p_vendor_po_number text DEFAULT NULL, p_confirmed_eta date DEFAULT NULL
)
RETURNS public.purchase_orders
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $$
DECLARE v_po public.purchase_orders%ROWTYPE;
BEGIN
  SELECT * INTO v_po FROM public.purchase_orders WHERE id = p_po_id FOR UPDATE;
  IF NOT FOUND OR NOT public.is_studio_comember(v_po.designer_id) THEN
    RAISE EXCEPTION 'log_po_acknowledgment: purchase order % not found or access denied', p_po_id;
  END IF;
  IF v_po.needs_repricing THEN
    RAISE EXCEPTION 'replacement purchase order must be repriced before acknowledgment'
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_po.status NOT IN ('draft','confirmed','in_production','shipped','delivered') THEN
    RAISE EXCEPTION 'cancelled purchase orders cannot be acknowledged'
      USING ERRCODE = 'check_violation';
  END IF;
  PERFORM set_config('app.ffe_mutation_rpc', 'on', true);
  UPDATE public.purchase_orders SET
    acknowledged_at = COALESCE(acknowledged_at, now()),
    status = CASE WHEN status = 'draft' THEN 'confirmed' ELSE status END,
    vendor_po_number = COALESCE(p_vendor_po_number, vendor_po_number),
    confirmed_eta = COALESCE(p_confirmed_eta, confirmed_eta)
  WHERE id = p_po_id RETURNING * INTO v_po;
  RETURN v_po;
END;
$$;

ALTER FUNCTION public.apply_board_room_state(uuid, text, uuid, jsonb)
  RENAME TO _apply_board_room_state_00448_impl;

REVOKE ALL ON FUNCTION public._apply_board_room_state_00448_impl(uuid, text, uuid, jsonb)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.apply_board_room_state(
  p_board_id uuid, p_owner_kind text, p_owner_id uuid, p_state jsonb
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $$
DECLARE v_cover_asset uuid := CASE WHEN p_state->>'coverReviewMediaAssetId' ~* '^[0-9a-f-]{36}$'
  THEN (p_state->>'coverReviewMediaAssetId')::uuid END;
BEGIN
  IF p_owner_kind = 'project' AND v_cover_asset IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.project_review_media_assets asset
    WHERE asset.id = v_cover_asset AND asset.project_id = p_owner_id
  ) THEN RAISE EXCEPTION 'board cover derivative belongs to another project'
    USING ERRCODE = 'integrity_constraint_violation'; END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(COALESCE(p_state->'items', '[]'::jsonb)) entry
    WHERE entry->>'reviewMediaAssetId' IS NOT NULL AND (
      entry->>'reviewMediaAssetId' !~* '^[0-9a-f-]{36}$' OR NOT EXISTS (
        SELECT 1 FROM public.project_review_media_assets asset
        WHERE asset.id = (entry->>'reviewMediaAssetId')::uuid AND asset.project_id = p_owner_id
      )
    )
  ) THEN RAISE EXCEPTION 'board reference derivative belongs to another project'
    USING ERRCODE = 'integrity_constraint_violation'; END IF;
  PERFORM public._apply_board_room_state_00448_impl(p_board_id, p_owner_kind, p_owner_id, p_state);
  IF p_owner_kind = 'project' THEN
    PERFORM set_config('app.board_state_rpc', 'on', true);
    UPDATE public.proposal_boards SET cover_review_media_asset_id = v_cover_asset
    WHERE id = p_board_id AND project_id = p_owner_id;
    UPDATE public.proposal_board_items placement
    SET review_media_asset_id = NULLIF(entry->>'reviewMediaAssetId', '')::uuid
    FROM jsonb_array_elements(p_state->'items') entry
    WHERE placement.id = (entry->>'id')::uuid AND placement.board_id = p_board_id;
  END IF;
END;
$$;

ALTER FUNCTION public.publish_project_review(jsonb)
  RENAME TO _publish_project_review_00448_impl;

REVOKE ALL ON FUNCTION public._publish_project_review_00448_impl(jsonb)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.publish_project_review(p_request jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp' AS $$
DECLARE
  v_project_id uuid := NULLIF(p_request->>'projectId', '')::uuid;
  v_result jsonb;
  v_edition_id uuid;
  v_boards jsonb;
  v_hash text;
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.proposal_boards board
    WHERE board.project_id = v_project_id
      AND board.id IN (SELECT value::uuid FROM jsonb_array_elements_text(COALESCE(p_request->'boardIds', '[]'::jsonb)))
      AND (
        (board.cover_image_url IS NOT NULL AND board.cover_review_media_asset_id IS NULL)
        OR EXISTS (
          SELECT 1 FROM public.proposal_board_items placement
          WHERE placement.board_id = board.id AND placement.project_ffe_item_id IS NULL
            AND placement.type IN ('image', 'room_scan') AND placement.image_url IS NOT NULL
            AND placement.review_media_asset_id IS NULL
        )
      )
  ) THEN
    RAISE EXCEPTION 'visual board references and covers require prepared review derivatives'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  v_result := public._publish_project_review_00448_impl(p_request);
  v_edition_id := (v_result->>'editionId')::uuid;

  INSERT INTO public.project_review_board_media_assets(
    edition_id, board_id, placement_id, media_role, asset_id, derivative_kind,
    storage_bucket, storage_path, checksum_sha256, size_bytes, content_type
  )
  SELECT v_edition_id, board.id, NULL, 'cover', asset.id, asset.derivative_kind,
    asset.storage_bucket, asset.storage_path, asset.checksum_sha256, asset.size_bytes, asset.content_type
  FROM public.proposal_boards board
  JOIN public.project_review_media_assets asset ON asset.id = board.cover_review_media_asset_id
  WHERE board.project_id = v_project_id
    AND board.id IN (SELECT value::uuid FROM jsonb_array_elements_text(COALESCE(p_request->'boardIds', '[]'::jsonb)));
  INSERT INTO public.project_review_board_media_assets(
    edition_id, board_id, placement_id, media_role, asset_id, derivative_kind,
    storage_bucket, storage_path, checksum_sha256, size_bytes, content_type
  )
  SELECT v_edition_id, board.id, placement.id, 'reference', asset.id, asset.derivative_kind,
    asset.storage_bucket, asset.storage_path, asset.checksum_sha256, asset.size_bytes, asset.content_type
  FROM public.proposal_boards board
  JOIN public.proposal_board_items placement ON placement.board_id = board.id
  JOIN public.project_review_media_assets asset ON asset.id = placement.review_media_asset_id
  WHERE board.project_id = v_project_id
    AND board.id IN (SELECT value::uuid FROM jsonb_array_elements_text(COALESCE(p_request->'boardIds', '[]'::jsonb)));

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', board.id, 'name', board.name, 'roomId', board.project_room_id,
    'canvasWidth', board.canvas_width, 'canvasHeight', board.canvas_height,
    'backgroundColor', board.background_color, 'sections', board.sections,
    'coverMedia', CASE WHEN cover.asset_id IS NULL THEN NULL ELSE jsonb_build_object(
      'assetId', cover.asset_id, 'checksumSha256', cover.checksum_sha256,
      'kind', cover.derivative_kind) END,
    'items', COALESCE((SELECT jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
      'id', placement.id, 'type', placement.type, 'selectionId', placement.project_ffe_item_id,
      'productId', placement.product_id, 'captureId', placement.capture_id,
      'paletteId', placement.palette_id, 'content', placement.content,
      'x', placement.x, 'y', placement.y, 'width', placement.width,
      'height', placement.height, 'zIndex', placement.z_index,
      'rotation', placement.rotation, 'locked', placement.locked,
      'sectionId', COALESCE(placement.data->>'sectionId', placement.data->>'section_id'),
      'renderMedia', CASE WHEN frozen.asset_id IS NULL THEN NULL ELSE jsonb_build_object(
        'assetId', frozen.asset_id, 'checksumSha256', frozen.checksum_sha256,
        'kind', frozen.derivative_kind) END
    )) ORDER BY placement.z_index, placement.id)
    FROM public.proposal_board_items placement
    LEFT JOIN public.project_review_board_media_assets frozen
      ON frozen.edition_id = v_edition_id AND frozen.placement_id = placement.id
    WHERE placement.board_id = board.id), '[]'::jsonb)
  ) ORDER BY board.sort_order, board.id), '[]'::jsonb)
  INTO v_boards
  FROM public.proposal_boards board
  LEFT JOIN public.project_review_board_media_assets cover
    ON cover.edition_id = v_edition_id AND cover.board_id = board.id AND cover.media_role = 'cover'
  WHERE board.project_id = v_project_id
    AND board.id IN (SELECT value::uuid FROM jsonb_array_elements_text(COALESCE(p_request->'boardIds', '[]'::jsonb)));
  SELECT encode(extensions.digest(jsonb_build_object(
    'editionId', edition.id, 'rooms', edition.room_snapshot, 'boards', v_boards,
    'items', (SELECT jsonb_agg(jsonb_build_object('id', item.id, 'hash', item.content_hash)
      ORDER BY item.sort_order, item.id) FROM public.project_review_items item WHERE item.edition_id = edition.id)
  )::text, 'sha256'), 'hex') INTO v_hash
  FROM public.project_review_editions edition WHERE edition.id = v_edition_id;
  PERFORM set_config('app.project_review_publish', 'on', true);
  UPDATE public.project_review_editions
  SET board_snapshot = v_boards, snapshot_hash = v_hash, updated_at = now()
  WHERE id = v_edition_id;
  RETURN v_result || jsonb_build_object('snapshotHash', v_hash);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_project_review_media_manifest(
  p_edition_id uuid, p_client_id uuid
)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $$
  WITH frozen AS (
    SELECT asset.id, asset.storage_bucket, asset.storage_path, asset.checksum_sha256,
      asset.size_bytes, asset.content_type
    FROM public.project_review_editions edition
    JOIN public.project_review_access access
      ON access.edition_id = edition.id AND access.actor_id = p_client_id
    JOIN public.project_review_items item ON item.edition_id = edition.id
    CROSS JOIN LATERAL jsonb_array_elements(item.media_manifest) media
    JOIN public.project_review_media_assets asset
      ON asset.id = (media->>'id')::uuid AND asset.project_id = edition.project_id
      AND asset.storage_bucket = media->>'bucket' AND asset.storage_path = media->>'path'
      AND asset.checksum_sha256 = media->>'checksumSha256'
      AND asset.size_bytes = (media->>'sizeBytes')::bigint AND asset.content_type = media->>'contentType'
    WHERE edition.id = p_edition_id AND edition.status IN ('published','superseded','finalized')
      AND access.status = 'active' AND (access.expires_at IS NULL OR access.expires_at > now())
    UNION ALL
    SELECT asset.id, asset.storage_bucket, asset.storage_path, asset.checksum_sha256,
      asset.size_bytes, asset.content_type
    FROM public.project_review_editions edition
    JOIN public.project_review_access access
      ON access.edition_id = edition.id AND access.actor_id = p_client_id
    JOIN public.project_review_board_media_assets frozen ON frozen.edition_id = edition.id
    JOIN public.project_review_media_assets asset
      ON asset.id = frozen.asset_id AND asset.project_id = edition.project_id
      AND asset.storage_bucket = frozen.storage_bucket AND asset.storage_path = frozen.storage_path
      AND asset.checksum_sha256 = frozen.checksum_sha256
      AND asset.size_bytes = frozen.size_bytes AND asset.content_type = frozen.content_type
    WHERE edition.id = p_edition_id AND edition.status IN ('published','superseded','finalized')
      AND access.status = 'active' AND (access.expires_at IS NULL OR access.expires_at > now())
  )
  SELECT COALESCE(jsonb_agg(DISTINCT jsonb_build_object(
    'assetId', id, 'bucket', storage_bucket, 'path', storage_path,
    'checksumSha256', checksum_sha256, 'sizeBytes', size_bytes, 'contentType', content_type
  )), '[]'::jsonb) FROM frozen;
$$;

CREATE OR REPLACE FUNCTION public.authorize_project_review_media(p_edition_id uuid, p_actor_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $$
DECLARE v_edition public.project_review_editions%ROWTYPE; v_expected integer; v_media jsonb;
BEGIN
  SELECT edition.* INTO v_edition FROM public.project_review_editions edition
  JOIN public.project_review_access access ON access.edition_id = edition.id AND access.actor_id = p_actor_id
  WHERE edition.id = p_edition_id AND edition.status IN ('published','superseded','finalized')
    AND access.status = 'active' AND (access.expires_at IS NULL OR access.expires_at > now());
  IF NOT FOUND THEN RAISE EXCEPTION 'review media not accessible' USING ERRCODE = 'insufficient_privilege'; END IF;
  SELECT (SELECT count(*) FROM public.project_review_items item
    CROSS JOIN LATERAL jsonb_array_elements(item.media_manifest) media WHERE item.edition_id = p_edition_id)
    + (SELECT count(*) FROM public.project_review_board_media_assets WHERE edition_id = p_edition_id)
  INTO v_expected;
  v_media := public.get_project_review_media_manifest(p_edition_id, p_actor_id);
  IF jsonb_array_length(v_media) <> v_expected THEN
    RAISE EXCEPTION 'published review media no longer matches its frozen manifest'
      USING ERRCODE = 'data_exception';
  END IF;
  RETURN jsonb_build_object('editionId', p_edition_id, 'projectId', v_edition.project_id,
    'actorId', p_actor_id, 'media', v_media);
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_published_review_media_asset()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public', 'pg_temp' AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.project_review_items item
    JOIN public.project_review_editions edition ON edition.id = item.edition_id
    CROSS JOIN LATERAL jsonb_array_elements(item.media_manifest) media
    WHERE (media->>'id')::uuid = OLD.id AND edition.status IN ('published','superseded','finalized')
  ) OR EXISTS (
    SELECT 1 FROM public.project_review_board_media_assets frozen
    JOIN public.project_review_editions edition ON edition.id = frozen.edition_id
    WHERE frozen.asset_id = OLD.id AND edition.status IN ('published','superseded','finalized')
  ) THEN
    RAISE EXCEPTION 'media referenced by a published review is immutable'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

REVOKE ALL ON FUNCTION public.guard_purchase_order_change_immutable(),
  public.guard_purchase_order_repricing(), public.guard_published_review_media_asset()
FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.create_purchase_order(
  uuid, uuid, public.purchase_order_payment_pattern, uuid[], text, date,
  boolean, date, integer, jsonb, text, text
), public.start_purchase_order_change(jsonb),
  public.log_po_acknowledgment(uuid, text, date),
  public.apply_board_room_state(uuid, text, uuid, jsonb),
  public.publish_project_review(jsonb)
FROM PUBLIC, anon, service_role;

GRANT EXECUTE ON FUNCTION public.create_purchase_order(
  uuid, uuid, public.purchase_order_payment_pattern, uuid[], text, date,
  boolean, date, integer, jsonb, text, text
), public.start_purchase_order_change(jsonb),
  public.log_po_acknowledgment(uuid, text, date),
  public.apply_board_room_state(uuid, text, uuid, jsonb),
  public.publish_project_review(jsonb)
TO authenticated;
