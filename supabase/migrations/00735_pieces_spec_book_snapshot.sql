-- ═══════════════════════════════════════════════════════════════════════════
-- 00735 — The spec-book snapshot carries unit, need, labor and rooms
--         (US-21 slice 1, W2; T-15, SQ-621)
-- ═══════════════════════════════════════════════════════════════════════════
-- CONTRACT §2 00735 (artifacts/pieces-building-room-2026-10-08/build/
-- CONTRACT.md). D7 phase 1 spec-book chapters, D2, D3, D5.
--
-- CREATE OR REPLACE base: _spec_book_current_item_snapshots at
-- 00714_spec_resolve_product_provenance.sql:124. Lineage 00380 → 00403 →
-- 00667 → 00714 → 00735. The body is 00714's verbatim apart from the changes
-- below. A later redefinition (00751, line groups) starts from this file.
--
-- ── WHAT THIS ADDS ──────────────────────────────────────────────────────────
-- Five snapshot keys, each NULL in a line's default state:
--   unit             NULLIF(i.unit, 'each')                         (D3, 00729)
--   needLabel        the thread's need_label, NULL when it equals
--                    the line name (or is unset)                    (D2, 00729)
--   lineKind         NULLIF(i.line_kind, 'goods')                    (D5, 00729)
--   parentFfeItemId  the parent piece, only on a labor line; a COM
--                    child's parent stays out of the snapshot        (D5, 00702)
--   placements       NULL unless the line has more than one room
--                    placement; otherwise [{roomName, quantity,
--                    areaNote}] in sort order. A single placement
--                    prints nothing extra.                          (D7, 00734)
-- The outer jsonb_strip_nulls (00714:146) drops a NULL key, so an unchanged
-- default line hashes to exactly its 00714 content_hash, and no issued spec
-- book reports a revision on deploy. jsonb_strip_nulls also drops a NULL
-- areaNote inside a placement.
--
-- ── WHAT THIS REMOVES ───────────────────────────────────────────────────────
-- A removed line (removed_at IS NOT NULL, the Q11/D8 archive marker that
-- 00731 writes; column 00434:208) is no longer in the snapshot, so it never
-- prints in a newly issued book (W1 review SQ-614 F6). Frozen revision rows
-- in spec_book_revision_items are untouched. Unchanged lines keep their hash.
--
-- Test: supabase/tests/spec_books/pieces_snapshot_hash_test.sql (inlines the
-- 00714 body as a temp function and compares hashes).
--
-- Grants: CREATE OR REPLACE keeps 00380's REVOKE ALL FROM PUBLIC, anon,
-- authenticated / GRANT EXECUTE TO service_role (00380:2016-2024). They are
-- re-stated below unchanged; the ACL is identical, so 00-legacy-grants needs
-- no regeneration for this file. This SECURITY DEFINER helper reads trade
-- prices and private notes, so it is deliberately not granted to
-- authenticated.
-- ═══════════════════════════════════════════════════════════════════════════

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
        'needLabel', NULLIF(t.need_label, i.name),
        'projectId', i.project_id,
        'room', CASE WHEN r.id IS NULL THEN NULL ELSE jsonb_build_object(
          'id', r.id, 'name', r.name
        ) END,
        'placements', pl.placements,
        'quantity', i.quantity,
        'unit', NULLIF(i.unit, 'each'),
        'lineKind', NULLIF(i.line_kind, 'goods'),
        'parentFfeItemId', CASE WHEN i.line_kind = 'labor' THEN i.parent_ffe_item_id END,
        'category', i.ffe_category,
        'selectedMedia', CASE
          WHEN jsonb_array_length(sp.selected_media) > 0 THEN sp.selected_media
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
          'markupPercent', i.markup_percent,
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
      extensions.digest(public._spec_book_canonical_json(source.snapshot), 'sha256'),
      'hex'
    )
  FROM source
  ORDER BY source.chapter_position, source.item_position, source.ffe_item_id;
$$;

REVOKE ALL ON FUNCTION public._spec_book_current_item_snapshots(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._spec_book_current_item_snapshots(uuid) TO service_role;
