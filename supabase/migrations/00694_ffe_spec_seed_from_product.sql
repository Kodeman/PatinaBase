-- ═══════════════════════════════════════════════════════════════════════════
-- 00694 — Seed a line's spec row from its product at placement (C-17)
-- ═══════════════════════════════════════════════════════════════════════════
-- US-16 Phase 1 (SQ-401). direction §7 C-17, d3 §4.4.
--
-- Lineage (redefined function): spec_book_attach_ffe_line
--   00380:556-587 (the only prior body; grep CREATE OR REPLACE confirms).
-- The body below is 00380's verbatim with ONE edit: the project_ffe_specs
-- INSERT also writes sku, finish, material, color_fabric and
-- selected_dimensions from the line's product, plus field_provenance naming
-- each seeded field 'product_master'. The spec-book item-settings half is
-- unchanged.
--
-- Before this, every spec row was born empty (00380:565-570), so the Spec Book
-- and the PO buy-spec block had nothing of their own to print until a
-- designer retyped the product's SKU and finish.
--
-- ── WHAT IS SEEDED ──────────────────────────────────────────────────────────
-- The product-master fields po-send already falls back to
-- (supabase/functions/po-send/lib.ts VendorProductMaster):
--   products.sku        → sku            (trimmed, blank = absent)
--   products.finish     → finish         (trimmed, blank = absent)
--   products.materials  → material       ONLY when it names exactly one value
--   products.colors     → color_fabric   ONLY when it names exactly one value
--   products.dimensions → selected_dimensions (a non-empty jsonb object)
-- The one-value rule is po-send's readSingle: "a list of options is not a
-- choice, so a PO never prints one". Seeding a joined list would turn options
-- into a printed buy spec.
--
-- field_provenance gets one key per seeded field, keyed like the other spec
-- contracts (na_declarations, source_verifications): sku, finish, material,
-- colorFabric, dimensions, each = 'product_master'. A designer's later edit
-- through the Spec Book replaces the value; the provenance key records where
-- an untouched value came from.
--
-- ── NEVER OVERWRITES ────────────────────────────────────────────────────────
-- At placement the row is new: the INSERT keeps ON CONFLICT DO NOTHING, so an
-- existing spec row is never touched. The backfill below fills a column only
-- where it is NULL, skips a field the designer declared N/A
-- (na_declarations), and skips rows whose configuration snapshot is locked
-- (00403's guard freezes those columns).
--
-- ── KNOWN READER EFFECT (not changed here) ──────────────────────────────────
-- resolveSpecValue (designer portal lib/spec-books/model.ts) and
-- _spec_book_resolve_field (00380) label any non-null spec column
-- 'project_override'. A seeded value prints the same text as before, now
-- labelled as an override. d3 §4.4 asks the resolver to read
-- field_provenance = 'product_master' as a fallback; that is portal and
-- resolver work outside this migration.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── _ffe_spec_seed_from_product ────────────────────────────────────────────
-- The seed values for one product, shared by the placement trigger and the
-- backfill. Zero rows for a NULL or missing product.
CREATE OR REPLACE FUNCTION public._ffe_spec_seed_from_product(p_product_id uuid)
RETURNS TABLE (
  sku text,
  finish text,
  material text,
  color_fabric text,
  selected_dimensions jsonb,
  field_provenance jsonb
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  WITH v AS (
    SELECT
      NULLIF(btrim(p.sku), '') AS sku,
      NULLIF(btrim(p.finish), '') AS finish,
      (SELECT CASE WHEN count(*) = 1 THEN min(e) END
         FROM (SELECT NULLIF(btrim(x), '') AS e FROM unnest(p.materials) x) m
        WHERE e IS NOT NULL) AS material,
      (SELECT CASE WHEN count(*) = 1 THEN min(e) END
         FROM (SELECT NULLIF(btrim(x), '') AS e FROM unnest(p.colors) x) c
        WHERE e IS NOT NULL) AS color_fabric,
      CASE WHEN jsonb_typeof(p.dimensions) = 'object' AND p.dimensions <> '{}'::jsonb
           THEN p.dimensions END AS selected_dimensions
    FROM public.products p
    WHERE p.id = p_product_id
  )
  SELECT
    v.sku, v.finish, v.material, v.color_fabric, v.selected_dimensions,
    jsonb_strip_nulls(jsonb_build_object(
      'sku',         CASE WHEN v.sku IS NOT NULL THEN 'product_master' END,
      'finish',      CASE WHEN v.finish IS NOT NULL THEN 'product_master' END,
      'material',    CASE WHEN v.material IS NOT NULL THEN 'product_master' END,
      'colorFabric', CASE WHEN v.color_fabric IS NOT NULL THEN 'product_master' END,
      'dimensions',  CASE WHEN v.selected_dimensions IS NOT NULL THEN 'product_master' END
    ))
  FROM v;
$$;

COMMENT ON FUNCTION public._ffe_spec_seed_from_product(uuid) IS
  'Spec-row seed values from a product master (00694, C-17): trimmed sku and finish, '
  'material / color_fabric only when materials / colors name exactly one value (po-send '
  'readSingle), non-empty dimensions object, and a field_provenance object marking each '
  'seeded field ''product_master''. Internal: used by spec_book_attach_ffe_line and the '
  '00694 backfill.';

REVOKE ALL ON FUNCTION public._ffe_spec_seed_from_product(uuid) FROM PUBLIC, anon, authenticated;

-- ─── spec_book_attach_ffe_line (00380 body + the seed) ──────────────────────
-- Every live schedule line gets one project-selection row. If its project has
-- a canonical book, it also gets one working item setting.
CREATE OR REPLACE FUNCTION public.spec_book_attach_ffe_line()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_book_id uuid;
  v_chapter_id uuid;
BEGIN
  -- 00694: seed the spec columns from the line's product. The LEFT JOIN keeps
  -- the row when the line has no product (a named need): all seed columns
  -- NULL and field_provenance '{}', exactly the 00380 row.
  INSERT INTO public.project_ffe_specs (
    ffe_item_id, routing_source,
    sku, finish, material, color_fabric, selected_dimensions, field_provenance
  )
  SELECT
    NEW.id,
    jsonb_strip_nulls(jsonb_build_object('source', NEW.added_via)),
    seed.sku, seed.finish, seed.material, seed.color_fabric, seed.selected_dimensions,
    COALESCE(seed.field_provenance, '{}'::jsonb)
  FROM (SELECT 1) AS one
  LEFT JOIN LATERAL public._ffe_spec_seed_from_product(NEW.product_id) AS seed ON true
  ON CONFLICT (ffe_item_id) DO NOTHING;

  SELECT id INTO v_book_id FROM public.spec_books WHERE project_id = NEW.project_id;
  IF v_book_id IS NOT NULL THEN
    SELECT id INTO v_chapter_id
    FROM public.spec_book_chapters
    WHERE spec_book_id = v_book_id AND project_room_id = NEW.project_room_id;

    INSERT INTO public.spec_book_item_settings (
      spec_book_id, ffe_item_id, chapter_id, position
    )
    VALUES (v_book_id, NEW.id, v_chapter_id, NEW.sort_order)
    ON CONFLICT (spec_book_id, ffe_item_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

-- ─── Backfill: existing spec rows, NULL columns only ────────────────────────
-- A field is filled only when its column is NULL, the product has a seed value
-- and no N/A declaration names it (contract key or column name, as po-send
-- and resolveSpecValue read them). Locked configuration snapshots are skipped.
-- field_provenance gains a key only for a field this UPDATE filled.
-- trg_project_ffe_specs_version bumps row_version / updated_at on each
-- changed row, which is the honest record that the row changed.
WITH candidate AS (
  SELECT
    s.id,
    seed.*,
    (s.sku IS NULL AND seed.sku IS NOT NULL
      AND NOT (s.na_declarations ? 'sku')) AS fill_sku,
    (s.finish IS NULL AND seed.finish IS NOT NULL
      AND NOT (s.na_declarations ? 'finish')) AS fill_finish,
    (s.material IS NULL AND seed.material IS NOT NULL
      AND NOT (s.na_declarations ? 'material')) AS fill_material,
    (s.color_fabric IS NULL AND seed.color_fabric IS NOT NULL
      AND NOT (s.na_declarations ?| ARRAY['colorFabric', 'color_fabric'])) AS fill_color,
    (s.selected_dimensions IS NULL AND seed.selected_dimensions IS NOT NULL
      AND NOT (s.na_declarations ?| ARRAY['dimensions', 'selected_dimensions'])) AS fill_dims
  FROM public.project_ffe_specs s
  JOIN public.project_ffe_items i ON i.id = s.ffe_item_id
  CROSS JOIN LATERAL public._ffe_spec_seed_from_product(i.product_id) AS seed
  WHERE i.product_id IS NOT NULL
    AND s.configuration_locked_at IS NULL
)
UPDATE public.project_ffe_specs s
   SET sku                 = CASE WHEN c.fill_sku      THEN c.sku                 ELSE s.sku END,
       finish              = CASE WHEN c.fill_finish   THEN c.finish              ELSE s.finish END,
       material            = CASE WHEN c.fill_material THEN c.material            ELSE s.material END,
       color_fabric        = CASE WHEN c.fill_color    THEN c.color_fabric        ELSE s.color_fabric END,
       selected_dimensions = CASE WHEN c.fill_dims     THEN c.selected_dimensions ELSE s.selected_dimensions END,
       field_provenance    = s.field_provenance || jsonb_strip_nulls(jsonb_build_object(
         'sku',         CASE WHEN c.fill_sku      THEN 'product_master' END,
         'finish',      CASE WHEN c.fill_finish   THEN 'product_master' END,
         'material',    CASE WHEN c.fill_material THEN 'product_master' END,
         'colorFabric', CASE WHEN c.fill_color    THEN 'product_master' END,
         'dimensions',  CASE WHEN c.fill_dims     THEN 'product_master' END
       ))
  FROM candidate c
 WHERE s.id = c.id
   AND (c.fill_sku OR c.fill_finish OR c.fill_material OR c.fill_color OR c.fill_dims);
