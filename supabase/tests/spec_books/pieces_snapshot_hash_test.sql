-- ═══════════════════════════════════════════════════════════════════════════
-- The spec-book snapshot carries unit, need, labor and rooms, hash-stable
-- (00735; US-21 T-15, SQ-621)
--
-- Migration: supabase/migrations/00735_pieces_spec_book_snapshot.sql.
-- Base: _spec_book_current_item_snapshots at 00714:124-260, inlined below
-- verbatim as pg_temp.spec_book_snapshots_00714 (only the name differs), so
-- the pre-migration hash is computed in this file against the same rows.
-- Columns: unit / line_kind / link_kind (00729), thread need_label (00729),
-- parent_ffe_item_id (00702), project_ffe_placements (00734), removed_at
-- (00434:208).
--
-- Asserts:
--   1. an unchanged default line, a line with a single placement and a COM
--      child each hash exactly as under 00714, and carry none of the new keys;
--   2. a four-room line's hash changes and its placements print in sort order;
--   3. a sq_ft line with its own need label carries unit and needLabel;
--   4. a labor line carries lineKind and parentFfeItemId;
--   5. a removed line is not in the snapshot (W1 review SQ-614 F6);
--   6. across every spec book in the database, every line still in its
--      default state keeps its 00714 hash, and the only rows dropped are
--      removed lines: no issued book reports a revision on deploy.
-- The file runs in one transaction and rolls back.
-- ═══════════════════════════════════════════════════════════════════════════
BEGIN;
SET LOCAL statement_timeout = '60s';

-- ─── The 00714 body, verbatim, as a temp function ───────────────────────────
CREATE OR REPLACE FUNCTION pg_temp.spec_book_snapshots_00714(p_spec_book_id uuid)
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

-- ─── Fixtures ───────────────────────────────────────────────────────────────
INSERT INTO auth.users(id,email,encrypted_password,email_confirmed_at,created_at,updated_at,instance_id,aud,role) VALUES
('73500000-0000-4000-8000-000000000001','sbh-owner@test.invalid','',now(),now(),now(),'00000000-0000-0000-0000-000000000000','authenticated','authenticated');
INSERT INTO public.profiles(id,email,full_name) VALUES
('73500000-0000-4000-8000-000000000001','sbh-owner@test.invalid','SBH Owner')
ON CONFLICT(id) DO NOTHING;
INSERT INTO public.projects(id,name,designer_id,created_by) VALUES
('73500000-0000-4000-8000-000000000101','SBH Project','73500000-0000-4000-8000-000000000001','73500000-0000-4000-8000-000000000001');
INSERT INTO public.project_rooms(id,project_id,name,sort_order) VALUES
('73500000-0000-4000-8000-000000000201','73500000-0000-4000-8000-000000000101','Primary Bedroom',0),
('73500000-0000-4000-8000-000000000202','73500000-0000-4000-8000-000000000101','Guest Bedroom',1),
('73500000-0000-4000-8000-000000000203','73500000-0000-4000-8000-000000000101','Hall',2),
('73500000-0000-4000-8000-000000000204','73500000-0000-4000-8000-000000000101','Study',3);

-- 601 default · 602 one placement · 603 four rooms · 604 sq_ft + own need
-- 605 labor child of 601 · 606 COM child of 601 · 607 removed (after attach)
INSERT INTO public.project_ffe_items(
  id,project_id,project_room_id,assignment_scope,name,doc_code,status,quantity,sort_order,
  unit_price_cents,currency,unit
) VALUES
('73500000-0000-4000-8000-000000000601','73500000-0000-4000-8000-000000000101',
 '73500000-0000-4000-8000-000000000201','room','Oak Bed','BD-01','specified',1,0,250000,'USD','each'),
('73500000-0000-4000-8000-000000000602','73500000-0000-4000-8000-000000000101',
 '73500000-0000-4000-8000-000000000201','room','Linen Drape','WT-01','specified',2,1,42000,'USD','each'),
('73500000-0000-4000-8000-000000000603','73500000-0000-4000-8000-000000000101',
 '73500000-0000-4000-8000-000000000201','room','Brass Sconce','LT-01','specified',8,2,18000,'USD','each'),
('73500000-0000-4000-8000-000000000604','73500000-0000-4000-8000-000000000101',
 '73500000-0000-4000-8000-000000000204','room','Calacatta Tile','FL-01','specified',120,3,2400,'USD','sq_ft'),
('73500000-0000-4000-8000-000000000607','73500000-0000-4000-8000-000000000101',
 '73500000-0000-4000-8000-000000000203','room','Runner','RG-01','specified',1,6,90000,'USD','each');

INSERT INTO public.project_ffe_items(
  id,project_id,project_room_id,assignment_scope,name,doc_code,status,quantity,sort_order,
  unit_price_cents,currency,parent_ffe_item_id,link_kind,line_kind,unit
) VALUES
('73500000-0000-4000-8000-000000000605','73500000-0000-4000-8000-000000000101',
 '73500000-0000-4000-8000-000000000201','room','Bed install','LB-01','specified',3,4,8500,'USD',
 '73500000-0000-4000-8000-000000000601','labor','labor','hour'),
('73500000-0000-4000-8000-000000000606','73500000-0000-4000-8000-000000000101',
 '73500000-0000-4000-8000-000000000201','room','Headboard fabric','FB-01','specified',4,5,6000,'USD',
 '73500000-0000-4000-8000-000000000601','com','goods','each');

-- Need labels: 601's equals its name (the 00729 backfill shape); 604's is the
-- studio's own word for the need.
UPDATE public.project_ffe_selection_threads t
SET need_label = i.name
FROM public.project_ffe_items i
WHERE i.id = '73500000-0000-4000-8000-000000000601' AND t.id = i.selection_thread_id;
UPDATE public.project_ffe_selection_threads t
SET need_label = 'Study floor'
FROM public.project_ffe_items i
WHERE i.id = '73500000-0000-4000-8000-000000000604' AND t.id = i.selection_thread_id;

-- Placements (00734 table; written directly here, as postgres). 602 has one
-- row; 603 has four, inserted out of sort order.
INSERT INTO public.project_ffe_placements(ffe_item_id,project_id,project_room_id,quantity,area_note,sort_order) VALUES
('73500000-0000-4000-8000-000000000602','73500000-0000-4000-8000-000000000101','73500000-0000-4000-8000-000000000201',2,NULL,0),
('73500000-0000-4000-8000-000000000603','73500000-0000-4000-8000-000000000101','73500000-0000-4000-8000-000000000204',2,NULL,3),
('73500000-0000-4000-8000-000000000603','73500000-0000-4000-8000-000000000101','73500000-0000-4000-8000-000000000201',2,'flanking the bed',0),
('73500000-0000-4000-8000-000000000603','73500000-0000-4000-8000-000000000101','73500000-0000-4000-8000-000000000203',2,NULL,2),
('73500000-0000-4000-8000-000000000603','73500000-0000-4000-8000-000000000101','73500000-0000-4000-8000-000000000202',2,NULL,1);

CREATE TEMP TABLE sbh_book ON COMMIT DROP AS SELECT NULL::uuid AS id;

DO $$
DECLARE
  v_book public.spec_books;
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub','73500000-0000-4000-8000-000000000001','role','authenticated')::text, true);
  v_book := public.ensure_project_spec_book('73500000-0000-4000-8000-000000000101');
  UPDATE sbh_book SET id = v_book.id;
END;
$$;

-- 607 is removed after it was attached to the book (00731's marker).
DO $$
BEGIN
  PERFORM set_config('app.ffe_mutation_rpc', 'on', true);
  UPDATE public.project_ffe_items
  SET removed_at = now(),
      removed_by = '73500000-0000-4000-8000-000000000001',
      removal_reason = 'removed while building'
  WHERE id = '73500000-0000-4000-8000-000000000607';
  PERFORM set_config('app.ffe_mutation_rpc', 'off', true);
END;
$$;

-- ─── Assertions ─────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_book uuid := (SELECT id FROM sbh_book);
  v_old_count integer;
  v_new_count integer;
  v_id uuid;
  v_old_hash text;
  v_new_hash text;
  v_snap jsonb;
  v_n integer;
BEGIN
  IF v_book IS NULL THEN
    RAISE EXCEPTION 'fixture: ensure_project_spec_book returned no book';
  END IF;

  SELECT count(*) INTO v_old_count FROM pg_temp.spec_book_snapshots_00714(v_book);
  IF v_old_count <> 7 THEN
    RAISE EXCEPTION 'fixture: expected 7 lines in the 00714 snapshot, got %', v_old_count;
  END IF;

  -- 1. Unchanged lines keep their 00714 hash and gain no key.
  FOREACH v_id IN ARRAY ARRAY[
    '73500000-0000-4000-8000-000000000601',  -- default, need label = name
    '73500000-0000-4000-8000-000000000602',  -- one placement prints nothing
    '73500000-0000-4000-8000-000000000606'   -- COM child: parent stays out
  ]::uuid[] LOOP
    SELECT content_hash INTO v_old_hash FROM pg_temp.spec_book_snapshots_00714(v_book) WHERE ffe_item_id = v_id;
    SELECT content_hash, item_snapshot INTO v_new_hash, v_snap
    FROM public._spec_book_current_item_snapshots(v_book) WHERE ffe_item_id = v_id;
    IF v_new_hash IS DISTINCT FROM v_old_hash THEN
      RAISE EXCEPTION 'hash stability: line % hashed % under 00714 and % under 00735', v_id, v_old_hash, v_new_hash;
    END IF;
    IF v_snap ?| ARRAY['unit','needLabel','lineKind','parentFfeItemId','placements'] THEN
      RAISE EXCEPTION 'default line % gained a new key: %', v_id, v_snap;
    END IF;
  END LOOP;

  -- 2. A four-room line's hash changes; placements print in sort order.
  SELECT content_hash INTO v_old_hash FROM pg_temp.spec_book_snapshots_00714(v_book)
  WHERE ffe_item_id = '73500000-0000-4000-8000-000000000603';
  SELECT content_hash, item_snapshot INTO v_new_hash, v_snap
  FROM public._spec_book_current_item_snapshots(v_book)
  WHERE ffe_item_id = '73500000-0000-4000-8000-000000000603';
  IF v_new_hash = v_old_hash THEN
    RAISE EXCEPTION 'four-room line: hash did not change (%)', v_new_hash;
  END IF;
  IF v_snap->'placements' IS DISTINCT FROM jsonb_build_array(
    jsonb_build_object('roomName','Primary Bedroom','quantity',2,'areaNote','flanking the bed'),
    jsonb_build_object('roomName','Guest Bedroom','quantity',2),
    jsonb_build_object('roomName','Hall','quantity',2),
    jsonb_build_object('roomName','Study','quantity',2)
  ) THEN
    RAISE EXCEPTION 'four-room line: placements wrong or out of sort order: %', v_snap->'placements';
  END IF;
  IF v_snap->'room'->>'name' IS DISTINCT FROM 'Primary Bedroom' THEN
    RAISE EXCEPTION 'four-room line: the primary room must still print: %', v_snap->'room';
  END IF;

  -- 3. Unit and need label.
  SELECT content_hash, item_snapshot INTO v_new_hash, v_snap
  FROM public._spec_book_current_item_snapshots(v_book)
  WHERE ffe_item_id = '73500000-0000-4000-8000-000000000604';
  IF v_snap->>'unit' IS DISTINCT FROM 'sq_ft' OR v_snap->>'needLabel' IS DISTINCT FROM 'Study floor' THEN
    RAISE EXCEPTION 'sq_ft line: expected unit sq_ft and needLabel "Study floor": %', v_snap;
  END IF;
  IF v_snap ? 'lineKind' OR v_snap ? 'parentFfeItemId' OR v_snap ? 'placements' THEN
    RAISE EXCEPTION 'sq_ft line: carries a key it should not: %', v_snap;
  END IF;

  -- 4. Labor line.
  SELECT item_snapshot INTO v_snap
  FROM public._spec_book_current_item_snapshots(v_book)
  WHERE ffe_item_id = '73500000-0000-4000-8000-000000000605';
  IF v_snap->>'lineKind' IS DISTINCT FROM 'labor'
     OR v_snap->>'parentFfeItemId' IS DISTINCT FROM '73500000-0000-4000-8000-000000000601'
     OR v_snap->>'unit' IS DISTINCT FROM 'hour' THEN
    RAISE EXCEPTION 'labor line: expected lineKind labor, unit hour and its parent: %', v_snap;
  END IF;

  -- 5. A removed line never prints (SQ-614 F6).
  IF NOT EXISTS (SELECT 1 FROM pg_temp.spec_book_snapshots_00714(v_book)
                 WHERE ffe_item_id = '73500000-0000-4000-8000-000000000607') THEN
    RAISE EXCEPTION 'fixture: the removed line must be in the 00714 snapshot';
  END IF;
  IF EXISTS (SELECT 1 FROM public._spec_book_current_item_snapshots(v_book)
             WHERE ffe_item_id = '73500000-0000-4000-8000-000000000607') THEN
    RAISE EXCEPTION 'removed line: still in the 00735 snapshot';
  END IF;
  SELECT count(*) INTO v_new_count FROM public._spec_book_current_item_snapshots(v_book);
  IF v_new_count <> 6 THEN
    RAISE EXCEPTION 'expected 6 lines in the 00735 snapshot, got %', v_new_count;
  END IF;

  -- 6. Every spec book in the database: a default line keeps its hash, and
  --    only removed lines drop out.
  SELECT count(*) INTO v_n
  FROM public.spec_books b
  CROSS JOIN LATERAL pg_temp.spec_book_snapshots_00714(b.id) o
  JOIN public.project_ffe_items i ON i.id = o.ffe_item_id
  LEFT JOIN public.project_ffe_selection_threads t ON t.id = i.selection_thread_id
  LEFT JOIN LATERAL public._spec_book_current_item_snapshots(b.id) n
    ON n.ffe_item_id = o.ffe_item_id
  WHERE i.removed_at IS NULL
    AND i.unit = 'each'
    AND i.line_kind = 'goods'
    AND (t.need_label IS NULL OR t.need_label = i.name)
    AND (SELECT count(*) FROM public.project_ffe_placements fp WHERE fp.ffe_item_id = i.id) <= 1
    AND n.content_hash IS DISTINCT FROM o.content_hash;
  IF v_n > 0 THEN
    RAISE EXCEPTION 'hash stability: % default line(s) across all spec books changed hash', v_n;
  END IF;

  SELECT count(*) INTO v_n
  FROM public.spec_books b
  CROSS JOIN LATERAL pg_temp.spec_book_snapshots_00714(b.id) o
  JOIN public.project_ffe_items i ON i.id = o.ffe_item_id
  WHERE i.removed_at IS NULL
    AND NOT EXISTS (SELECT 1 FROM public._spec_book_current_item_snapshots(b.id) n
                    WHERE n.ffe_item_id = o.ffe_item_id);
  IF v_n > 0 THEN
    RAISE EXCEPTION 'row set: % live line(s) dropped out of a spec book', v_n;
  END IF;
END;
$$;

\echo 'pieces_snapshot_hash_test: default lines hash as 00714; four-room, unit, need and labor keys print; removed lines drop'
ROLLBACK;
