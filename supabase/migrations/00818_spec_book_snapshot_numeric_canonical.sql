-- ═══════════════════════════════════════════════════════════════════════════
-- 00818 — Spec book snapshot numbers survive the renderer's JSON round trip
-- (US-37 release C, F7, SQ-1292; found by walk C, SQ-1111)
--
-- The bug. 00809 made project_ffe_items.markup_percent the exact markup of
-- the line's cents, trim_scale((client - cost) x 100 / cost). A typed round
-- client price over a cost that does not divide it (drapery $2,400 over
-- $1,800) stores 33.3333333333333333. _spec_book_current_item_snapshots
-- (00807:1072) copies that into pricing.markupPercent, so it lands in
-- spec_book_revisions.render_snapshot. prepare_spec_book_issue checksums the
-- snapshot with _spec_book_canonical_json (00380:1077), which prints numbers
-- exactly. The spec-book-render edge function reads the snapshot through
-- JSON.parse, which holds 33.333333333333336, and canonicalStringify
-- (render-model.ts) prints that. The two texts differ, core.ts raises
-- snapshot_checksum_mismatch, and no PDF is made.
--
-- The fix. The snapshot builder rounds the one number in it that is derived by
-- division: markupPercent = trim_scale(round(markup_percent, 4)). The stored
-- column keeps its full precision (US-37 D4); only the frozen copy rounds.
-- Display uses one decimal, so four is exact enough. With int4 cents, a
-- markup whose fraction does not end within four places (cost of 3 cents or
-- more) has at most 11 integer digits, so it carries at most 15 significant
-- digits. A double holds 15, so JSON.parse then JSON.stringify gives back the
-- same digits, and the checksum SQL computed is the one the renderer gets.
-- The SQL checksum stays the single authority; the renderer is unchanged.
--
-- Every other number in render_snapshot was checked, and none is derived by
-- division:
--   * integers from int4 columns: quantity, placements[].quantity,
--     clientPriceCents, tradePriceCents, rowVersion, chapter position,
--     template version, contractVersion;
--   * the configuration snapshot (00403 evaluation): integer cents and weeks,
--     summed, never divided;
--   * jsonb passed through as written by the portal or capture (book settings,
--     template layout, hero media, selection values, dimensions, provenance).
--     A JSON encoder wrote those numbers, so they already parse back to the
--     same digits. The one exception would be a value below 1e-6 or at least
--     1e21, which JavaScript prints in exponent form; none exists, and none
--     is a plausible setting or dimension.
-- No margin, blended or tax figure is in the spec book snapshot. The builder
-- computes none of them, and sales tax lives in project_pricing_settings,
-- which neither the builder nor prepare_spec_book_issue reads.
--
-- Unchanged: what any edition contains. The pricing object keeps its four keys
-- (clientPriceCents, tradePriceCents, markupPercent, currency), and the
-- renderer still strips cost and markup from every edition but internal.
-- Content hashes change only for a line whose markup has more than four
-- decimal places; those lines could not be issued before this fix.
--
-- Orphan pending revisions (reported, not changed). A failed render leaves
-- its revision 'pending': spec_book_revisions.status is 'pending'|'issued'
-- only (00380:164), and the edge function marks the artifact 'failed' with its
-- error_code, which the workspace offers to Retry in place. That predates
-- release C. It does not block the next Issue: prepare_spec_book_issue counts
-- only issued revisions as the prior one and has no pending-revision guard; a
-- failed attempt only uses up a revision number. A revision frozen with a
-- full-precision markup before this migration keeps failing on Retry, because
-- its snapshot is immutable. Such revisions can exist only on a local stack
-- that applied 00809 without 00818, so 00818 must ship in the same push as
-- 00809.
--
-- Body: 00807:968-1138 verbatim apart from the markupPercent line. 00807's
-- SQ-1128 F4 picture fallback is kept. A later redefinition of
-- _spec_book_current_item_snapshots must graft from this body. CREATE OR
-- REPLACE keeps the function's owner and ACL (service_role only, 00807:1140),
-- so there is no GRANT or REVOKE here and the legacy-grants seed is unchanged.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── _spec_book_current_item_snapshots (base 00807:968) ───────────────────
CREATE OR REPLACE FUNCTION public._spec_book_current_item_snapshots(p_spec_book_id uuid)
RETURNS TABLE (
  ffe_item_id uuid,
  item_type text,
  document_code text,
  chapter_position integer,
  item_position integer,
  item_snapshot jsonb,
  content_hash text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
  WITH source AS (
    SELECT
      i.id AS ffe_item_id,
      i.item_type,
      i.doc_code,
      COALESCE(c.position, 2147483647) AS chapter_position,
      s.position AS item_position,
      jsonb_strip_nulls(jsonb_build_object(
        'ffeItemId', i.id,
        'itemType', i.item_type,
        'documentCode', i.doc_code,
        'name', i.name,
        'needLabel', CASE WHEN t.primary_ffe_item_id = i.id THEN NULLIF(t.need_label, i.name) END,
        'projectId', i.project_id,
        'chapterId', c.id,
        'room', CASE WHEN r.id IS NULL THEN NULL ELSE jsonb_build_object(
          'id', r.id, 'name', r.name
        ) END,
        'lineGroup', CASE WHEN lg.id IS NULL THEN NULL ELSE jsonb_build_object(
          'id', lg.id, 'name', lg.name
        ) END,
        'placements', pl.placements,
        'quantity', i.quantity,
        'unit', NULLIF(i.unit, 'each'),
        'lineKind', NULLIF(i.line_kind, 'goods'),
        'parentFfeItemId', CASE WHEN i.line_kind = 'labor' THEN i.parent_ffe_item_id END,
        'category', i.ffe_category,
        'selectedMedia', CASE
          WHEN jsonb_array_length(sp.selected_media) > 0 THEN sp.selected_media
          -- 00807 (SQ-1128 F4): the item's own pictures, the primary first;
          -- the live product's images only when the item has none.
          WHEN own_images.urls IS NOT NULL THEN to_jsonb(own_images.urls)
          ELSE COALESCE(to_jsonb(p.images), '[]'::jsonb)
        END,
        'selection', jsonb_build_object(
          'sku', public._spec_book_resolve_field(
            to_jsonb(sp.sku), i.custom_fields->'sku', to_jsonb(p.sku),
            p.capture_provenance#>'{studioCustom,sku}', sp.na_declarations->'sku',
            sp.updated_at, i.updated_at, p.updated_at,
            NULLIF(sp.source_verifications->>'sku', '')::timestamptz,
            sp.field_provenance->>'sku'
          ),
          'finish', public._spec_book_resolve_field(
            to_jsonb(sp.finish), i.custom_fields->'finish', to_jsonb(p.finish),
            p.capture_provenance#>'{studioCustom,finish}', sp.na_declarations->'finish',
            sp.updated_at, i.updated_at, p.updated_at,
            NULLIF(sp.source_verifications->>'finish', '')::timestamptz,
            sp.field_provenance->>'finish'
          ),
          'material', public._spec_book_resolve_field(
            to_jsonb(sp.material), i.custom_fields->'material', to_jsonb(p.materials),
            p.capture_provenance#>'{studioCustom,material}', sp.na_declarations->'material',
            sp.updated_at, i.updated_at, p.updated_at,
            NULLIF(sp.source_verifications->>'material', '')::timestamptz,
            sp.field_provenance->>'material'
          ),
          'colorFabric', public._spec_book_resolve_field(
            to_jsonb(sp.color_fabric), i.custom_fields->'colorFabric', to_jsonb(p.colors),
            p.capture_provenance#>'{studioCustom,colorFabric}', sp.na_declarations->'colorFabric',
            sp.updated_at, i.updated_at, p.updated_at,
            NULLIF(sp.source_verifications->>'colorFabric', '')::timestamptz,
            sp.field_provenance->>'colorFabric'
          ),
          'dimensions', public._spec_book_resolve_field(
            sp.selected_dimensions, i.custom_fields->'dimensions', p.dimensions,
            p.capture_provenance#>'{studioCustom,dimensions}', sp.na_declarations->'dimensions',
            sp.updated_at, i.updated_at, p.updated_at,
            NULLIF(sp.source_verifications->>'dimensions', '')::timestamptz,
            sp.field_provenance->>'dimensions'
          ),
          'exactLocation', public._spec_book_resolve_field(
            to_jsonb(sp.exact_location), i.custom_fields->'exactLocation', NULL,
            p.capture_provenance#>'{studioCustom,exactLocation}', sp.na_declarations->'exactLocation',
            sp.updated_at, i.updated_at, p.updated_at,
            NULLIF(sp.source_verifications->>'exactLocation', '')::timestamptz,
            sp.field_provenance->>'exactLocation'
          )
        ),
        'notes', jsonb_build_object(
          'client', sp.client_notes,
          'trade', sp.trade_notes,
          'install', sp.install_notes,
          'private', i.notes,
          'care', sp.care_notes,
          'warranty', sp.warranty_notes
        ),
        'pricing', jsonb_build_object(
          'clientPriceCents', i.unit_price_cents,
          'tradePriceCents', i.trade_price_cents,
          -- 00818 (F7): four decimal places, so the frozen number survives
          -- the renderer's JSON.parse and the snapshot checksum holds.
          'markupPercent', trim_scale(round(i.markup_percent, 4)),
          'currency', i.currency
        ),
        'vendor', jsonb_build_object(
          'id', i.vendor_id,
          'name', i.vendor_name,
          'internalContact', p.vendor_contact
        ),
        'configuration', CASE WHEN sp.configuration_id IS NULL THEN NULL ELSE jsonb_build_object(
          'id', sp.configuration_id,
          'snapshot', sp.configuration_snapshot,
          'snapshotHash', sp.configuration_snapshot_hash,
          'lockedAt', sp.configuration_locked_at
        ) END,
        'provenance', sp.field_provenance,
        'sourceVerification', sp.source_verifications,
        'naDeclarations', sp.na_declarations,
        'readinessStatus', sp.readiness_status,
        'rowVersion', sp.row_version
      )) AS snapshot
    FROM public.spec_book_item_settings s
    JOIN public.spec_books b ON b.id = s.spec_book_id
    JOIN public.project_ffe_items i ON i.id = s.ffe_item_id
    JOIN public.project_ffe_specs sp ON sp.ffe_item_id = i.id
    LEFT JOIN public.spec_book_chapters c ON c.id = s.chapter_id
    LEFT JOIN public.project_rooms r ON r.id = i.project_room_id
    LEFT JOIN public.products p ON p.id = i.product_id
    LEFT JOIN public.project_ffe_selection_threads t ON t.id = i.selection_thread_id
    LEFT JOIN public.project_line_groups lg ON lg.id = i.line_group_id
    LEFT JOIN LATERAL (
      SELECT CASE WHEN count(*) > 1 THEN jsonb_agg(jsonb_build_object(
          'roomName', pr.name,
          'quantity', fp.quantity,
          'areaNote', fp.area_note
        ) ORDER BY fp.sort_order, fp.created_at, fp.id)
      END AS placements
      FROM public.project_ffe_placements fp
      JOIN public.project_rooms pr ON pr.id = fp.project_room_id
      WHERE fp.ffe_item_id = i.id
    ) pl ON true
    -- 00807: primary_image_url's order, so the first entry is the primary.
    -- NULL when the item has no picture rows.
    LEFT JOIN LATERAL (
      SELECT array_agg(image.url ORDER BY image.is_primary DESC, image.position,
                       image.created_at, image.id) AS urls
      FROM public.project_ffe_item_images image
      WHERE image.item_id = i.id
    ) own_images ON true
    WHERE s.spec_book_id = p_spec_book_id
      AND s.included
      AND (c.id IS NULL OR c.included)
      AND i.removed_at IS NULL
  )
  SELECT
    source.ffe_item_id,
    source.item_type,
    source.doc_code,
    source.chapter_position,
    source.item_position,
    source.snapshot,
    encode(
      extensions.digest(public._spec_book_canonical_json(source.snapshot - 'chapterId'), 'sha256'),
      'hex'
    )
  FROM source
  ORDER BY source.chapter_position, source.item_position, source.ffe_item_id;
$$;
