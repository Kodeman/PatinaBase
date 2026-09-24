-- ═══════════════════════════════════════════════════════════════════════════
-- 00667 — Spec Book item snapshots carry the price's currency (T6-01d, SQ-214)
--
-- Found in SQ-212. `_spec_book_current_item_snapshots` froze item prices into
-- Spec Book snapshots without `project_ffe_items.currency` (00661). The
-- spec-book-render edge function (SQ-212) prints a frozen client price in
-- `pricing.currency` when the snapshot has one and reads a missing currency as
-- USD. Without it, a non-USD item printed with "$".
--
-- Lineage: 00380 → 00403 → 00667. The body below is 00403's verbatim, apart
-- from one added key: `pricing.currency` = `i.currency`. A later redefinition
-- starts from this file.
--
-- Existing frozen snapshots in spec_book_revision_items are left unchanged.
-- Every row priced before 00661 is USD, and the renderer reads a missing
-- currency as USD, so they already print correctly. New issues hash the added
-- key into content_hash; no reader compares a current hash with a frozen one.
--
-- Grants: CREATE OR REPLACE keeps 00380's REVOKE ALL / GRANT EXECUTE TO
-- service_role, so this file adds no GRANT or REVOKE.
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
        'projectId', i.project_id,
        'room', CASE WHEN r.id IS NULL THEN NULL ELSE jsonb_build_object(
          'id', r.id, 'name', r.name
        ) END,
        'quantity', i.quantity,
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
            NULLIF(sp.source_verifications->>'sku', '')::timestamptz
          ),
          'finish', public._spec_book_resolve_field(
            to_jsonb(sp.finish), i.custom_fields->'finish', to_jsonb(p.finish),
            p.capture_provenance#>'{studioCustom,finish}', sp.na_declarations->'finish',
            sp.updated_at, i.updated_at, p.updated_at,
            NULLIF(sp.source_verifications->>'finish', '')::timestamptz
          ),
          'material', public._spec_book_resolve_field(
            to_jsonb(sp.material), i.custom_fields->'material', to_jsonb(p.materials),
            p.capture_provenance#>'{studioCustom,material}', sp.na_declarations->'material',
            sp.updated_at, i.updated_at, p.updated_at,
            NULLIF(sp.source_verifications->>'material', '')::timestamptz
          ),
          'colorFabric', public._spec_book_resolve_field(
            to_jsonb(sp.color_fabric), i.custom_fields->'colorFabric', to_jsonb(p.colors),
            p.capture_provenance#>'{studioCustom,colorFabric}', sp.na_declarations->'colorFabric',
            sp.updated_at, i.updated_at, p.updated_at,
            NULLIF(sp.source_verifications->>'colorFabric', '')::timestamptz
          ),
          'dimensions', public._spec_book_resolve_field(
            sp.selected_dimensions, i.custom_fields->'dimensions', p.dimensions,
            p.capture_provenance#>'{studioCustom,dimensions}', sp.na_declarations->'dimensions',
            sp.updated_at, i.updated_at, p.updated_at,
            NULLIF(sp.source_verifications->>'dimensions', '')::timestamptz
          ),
          'exactLocation', public._spec_book_resolve_field(
            to_jsonb(sp.exact_location), i.custom_fields->'exactLocation', NULL,
            p.capture_provenance#>'{studioCustom,exactLocation}', sp.na_declarations->'exactLocation',
            sp.updated_at, i.updated_at, p.updated_at,
            NULLIF(sp.source_verifications->>'exactLocation', '')::timestamptz
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
    WHERE s.spec_book_id = p_spec_book_id
      AND s.included
      AND (c.id IS NULL OR c.included)
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
