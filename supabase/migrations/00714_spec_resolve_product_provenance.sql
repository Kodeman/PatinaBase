-- ═══════════════════════════════════════════════════════════════════════════
-- 00714 — Spec values seeded from the product resolve as product master (C-17)
-- ═══════════════════════════════════════════════════════════════════════════
-- US-16 Phase 1 (SQ-439), follow-up to 00694 (SQ-401). d3 §4.4.
--
-- 00694 seeds project_ffe_specs sku / finish / material / color_fabric /
-- selected_dimensions from the line's product and marks each seeded field in
-- the field_provenance object: {"sku": "product_master", ...} (contract keys
-- sku, finish, material, colorFabric, dimensions). _spec_book_resolve_field
-- still labelled every non-null spec column 'project_override', so a seeded
-- value printed as a project override.
--
-- 1. _spec_book_resolve_field gains a 10-argument form that takes the field's
--    provenance. A spec value whose provenance is 'product_master' is a
--    product-tier value: an FF&E line value still wins over it, and it wins
--    over the raw product master (it is the single seeded choice, where the
--    master can be a list of options). Any other spec value stays the project
--    override. The 9-argument form (00380) delegates with a NULL provenance,
--    so both forms share one rule. Same IMMUTABLE / INVOKER /
--    search_path = public as 00380, and the same grants.
-- 2. _spec_book_current_item_snapshots passes each field's provenance.
--    Lineage 00380 → 00403 → 00667 → 00714: the body is 00667's verbatim
--    apart from the added provenance argument on each resolver call. Prod has
--    no issued revisions, so no frozen hash is compared against the new one.
-- 3. A designer edit flips a seeded field to override. The Spec Book editor
--    (useUpdateProjectFfeSpec) writes the columns and never touches
--    field_provenance, so the key would outlive the edit. A BEFORE UPDATE
--    trigger drops a field's 'product_master' key when that column's value
--    changes and the same statement did not set the key itself. Saving an
--    unchanged value keeps the key. Absent provenance means override.
--
-- The designer portal's resolveSpecValue (lib/spec-books/model.ts) applies
-- the same rule.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. _spec_book_resolve_field with provenance ────────────────────────────
CREATE OR REPLACE FUNCTION public._spec_book_resolve_field(
  p_override jsonb,
  p_line jsonb,
  p_master jsonb,
  p_studio jsonb,
  p_na jsonb,
  p_override_at timestamptz,
  p_line_at timestamptz,
  p_master_at timestamptz,
  p_verified_at timestamptz,
  p_override_provenance text
)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN COALESCE((p_na->>'na')::boolean, false) THEN
      jsonb_build_object(
        'value', NULL, 'source', 'declaration', 'sourceUpdatedAt', p_override_at,
        'verifiedAt', p_verified_at, 'na', true, 'naReason', p_na->>'reason'
      )
    WHEN p_override IS NOT NULL AND p_override <> 'null'::jsonb
         AND p_override_provenance IS DISTINCT FROM 'product_master' THEN
      jsonb_build_object(
        'value', p_override, 'source', 'project_override', 'sourceUpdatedAt', p_override_at,
        'verifiedAt', p_verified_at, 'na', false, 'naReason', NULL
      )
    WHEN p_line IS NOT NULL AND p_line <> 'null'::jsonb THEN
      jsonb_build_object(
        'value', p_line, 'source', 'ffe_line', 'sourceUpdatedAt', p_line_at,
        'verifiedAt', p_verified_at, 'na', false, 'naReason', NULL
      )
    -- Reached with a non-null p_override only when it was seeded from the product.
    WHEN p_override IS NOT NULL AND p_override <> 'null'::jsonb THEN
      jsonb_build_object(
        'value', p_override, 'source', 'product_master', 'sourceUpdatedAt', p_master_at,
        'verifiedAt', p_verified_at, 'na', false, 'naReason', NULL
      )
    WHEN p_master IS NOT NULL AND p_master <> 'null'::jsonb THEN
      jsonb_build_object(
        'value', p_master, 'source', 'product_master', 'sourceUpdatedAt', p_master_at,
        'verifiedAt', p_verified_at, 'na', false, 'naReason', NULL
      )
    WHEN p_studio IS NOT NULL AND p_studio <> 'null'::jsonb THEN
      jsonb_build_object(
        'value', p_studio, 'source', 'studio_custom', 'sourceUpdatedAt', p_master_at,
        'verifiedAt', p_verified_at, 'na', false, 'naReason', NULL
      )
    ELSE
      jsonb_build_object(
        'value', NULL, 'source', NULL, 'sourceUpdatedAt', NULL,
        'verifiedAt', p_verified_at, 'na', false, 'naReason', NULL
      )
  END;
$$;

-- The 00380 form: no provenance, so a non-null spec value is the override.
CREATE OR REPLACE FUNCTION public._spec_book_resolve_field(
  p_override jsonb,
  p_line jsonb,
  p_master jsonb,
  p_studio jsonb,
  p_na jsonb,
  p_override_at timestamptz,
  p_line_at timestamptz,
  p_master_at timestamptz,
  p_verified_at timestamptz
)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT public._spec_book_resolve_field(
    p_override, p_line, p_master, p_studio, p_na,
    p_override_at, p_line_at, p_master_at, p_verified_at, NULL::text
  );
$$;

REVOKE ALL ON FUNCTION public._spec_book_resolve_field(jsonb,jsonb,jsonb,jsonb,jsonb,timestamptz,timestamptz,timestamptz,timestamptz,text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._spec_book_resolve_field(jsonb,jsonb,jsonb,jsonb,jsonb,timestamptz,timestamptz,timestamptz,timestamptz,text)
  TO service_role;

-- ─── 2. Snapshots pass each field's provenance (00667 body + provenance) ────
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

-- ─── 3. An edit to a seeded field drops its product_master key ──────────────
CREATE OR REPLACE FUNCTION public.spec_ffe_drop_edited_product_provenance()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_field record;
BEGIN
  FOR v_field IN
    SELECT f.key, f.changed
    FROM (VALUES
      ('sku',         NEW.sku IS DISTINCT FROM OLD.sku),
      ('finish',      NEW.finish IS DISTINCT FROM OLD.finish),
      ('material',    NEW.material IS DISTINCT FROM OLD.material),
      ('colorFabric', NEW.color_fabric IS DISTINCT FROM OLD.color_fabric),
      ('dimensions',  NEW.selected_dimensions IS DISTINCT FROM OLD.selected_dimensions)
    ) AS f(key, changed)
  LOOP
    IF v_field.changed
       AND OLD.field_provenance->>v_field.key = 'product_master'
       AND NEW.field_provenance->v_field.key IS NOT DISTINCT FROM OLD.field_provenance->v_field.key
    THEN
      NEW.field_provenance := NEW.field_provenance - v_field.key;
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.spec_ffe_drop_edited_product_provenance() IS
  'BEFORE UPDATE on project_ffe_specs (00714, C-17): when a seeded spec column''s value '
  'changes and the statement leaves its field_provenance key alone, drop the '
  '''product_master'' key so the edited value resolves as the project override.';

-- A trigger function, not an RPC (00381 convention).
REVOKE ALL ON FUNCTION public.spec_ffe_drop_edited_product_provenance()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS trg_project_ffe_specs_provenance ON public.project_ffe_specs;
CREATE TRIGGER trg_project_ffe_specs_provenance
  BEFORE UPDATE OF sku, finish, material, color_fabric, selected_dimensions
  ON public.project_ffe_specs
  FOR EACH ROW EXECUTE FUNCTION public.spec_ffe_drop_edited_product_provenance();
