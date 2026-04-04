-- ═══════════════════════════════════════════════════════════════════════════
-- COLLECTIONS ENHANCEMENTS
-- Add missing columns for collection types, status, rules, SEO, and more.
-- Add admin RLS policies and rule evaluation function.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── NEW COLUMNS ON collections ─────────────────────────────────────────────

ALTER TABLE collections
  ADD COLUMN IF NOT EXISTS slug TEXT,
  ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'manual'
    CHECK (type IN ('manual', 'rule', 'smart')),
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'draft'
    CHECK (status IN ('draft', 'published', 'scheduled')),
  ADD COLUMN IF NOT EXISTS featured BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS display_order INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS scheduled_publish_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS seo_title TEXT,
  ADD COLUMN IF NOT EXISTS seo_description TEXT,
  ADD COLUMN IF NOT EXISTS rule JSONB;

-- Notes field on collection_products for per-item annotations
ALTER TABLE collection_products
  ADD COLUMN IF NOT EXISTS notes TEXT;

-- ─── BACKFILL EXISTING ROWS ─────────────────────────────────────────────────

UPDATE collections SET
  slug = lower(regexp_replace(name, '[^a-z0-9]+', '-', 'gi')),
  type = 'manual',
  status = 'draft'
WHERE slug IS NULL;

-- ─── INDEXES ────────────────────────────────────────────────────────────────

CREATE UNIQUE INDEX IF NOT EXISTS idx_collections_slug
  ON collections(slug);

CREATE INDEX IF NOT EXISTS idx_collections_type
  ON collections(type);

CREATE INDEX IF NOT EXISTS idx_collections_status
  ON collections(status);

CREATE INDEX IF NOT EXISTS idx_collections_featured
  ON collections(featured) WHERE featured = true;

CREATE INDEX IF NOT EXISTS idx_collections_display_order
  ON collections(display_order);

CREATE INDEX IF NOT EXISTS idx_collections_tags
  ON collections USING GIN (tags);

-- ─── ADMIN RLS POLICIES ────────────────────────────────────────────────────
-- Admins (users with a role in the 'admin' domain) can manage all collections.

CREATE POLICY "Admins can manage all collections"
  ON collections FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles ur
      JOIN roles r ON r.id = ur.role_id
      WHERE ur.user_id = auth.uid()
        AND r.domain = 'admin'
    )
  );

CREATE POLICY "Admins can manage all collection products"
  ON collection_products FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles ur
      JOIN roles r ON r.id = ur.role_id
      WHERE ur.user_id = auth.uid()
        AND r.domain = 'admin'
    )
  );

-- ─── RULE EVALUATION FUNCTION ──────────────────────────────────────────────
-- Evaluates rule-based collection conditions against the products table.
-- Syncs collection_products: adds matching products, removes non-matching ones.

CREATE OR REPLACE FUNCTION evaluate_collection_rules(p_collection_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_rule JSONB;
  v_type TEXT;
  v_operator TEXT;
  v_conditions JSONB;
  v_condition JSONB;
  v_where_clauses TEXT[] := '{}';
  v_clause TEXT;
  v_field TEXT;
  v_op TEXT;
  v_value JSONB;
  v_query TEXT;
  v_added INT := 0;
  v_removed INT := 0;
BEGIN
  -- Get the collection rule
  SELECT c.rule, c.type INTO v_rule, v_type
  FROM collections c
  WHERE c.id = p_collection_id;

  IF v_type != 'rule' OR v_rule IS NULL THEN
    RETURN jsonb_build_object('error', 'Collection is not rule-based or has no rule defined');
  END IF;

  v_operator := COALESCE(v_rule->>'operator', 'AND');
  v_conditions := COALESCE(v_rule->'conditions', '[]'::jsonb);

  IF jsonb_array_length(v_conditions) = 0 THEN
    RETURN jsonb_build_object('error', 'No conditions defined');
  END IF;

  -- Build WHERE clauses from conditions
  FOR v_condition IN SELECT * FROM jsonb_array_elements(v_conditions)
  LOOP
    v_field := v_condition->>'field';
    v_op := v_condition->>'operator';
    v_value := v_condition->'value';

    v_clause := NULL;

    -- Map fields to product columns and build SQL conditions
    CASE v_field
      WHEN 'category' THEN
        CASE v_op
          WHEN 'equals' THEN v_clause := format('category = %L', v_value #>> '{}');
          WHEN 'not_equals' THEN v_clause := format('category != %L', v_value #>> '{}');
          WHEN 'in' THEN v_clause := format('category = ANY(ARRAY(SELECT jsonb_array_elements_text(%L::jsonb)))', v_value::text);
          WHEN 'not_in' THEN v_clause := format('category != ALL(ARRAY(SELECT jsonb_array_elements_text(%L::jsonb)))', v_value::text);
          WHEN 'contains' THEN v_clause := format('category ILIKE %L', '%' || (v_value #>> '{}') || '%');
          ELSE NULL;
        END CASE;

      WHEN 'brand' THEN
        CASE v_op
          WHEN 'equals' THEN v_clause := format('brand = %L', v_value #>> '{}');
          WHEN 'not_equals' THEN v_clause := format('brand != %L', v_value #>> '{}');
          WHEN 'in' THEN v_clause := format('brand = ANY(ARRAY(SELECT jsonb_array_elements_text(%L::jsonb)))', v_value::text);
          WHEN 'not_in' THEN v_clause := format('brand != ALL(ARRAY(SELECT jsonb_array_elements_text(%L::jsonb)))', v_value::text);
          WHEN 'contains' THEN v_clause := format('brand ILIKE %L', '%' || (v_value #>> '{}') || '%');
          ELSE NULL;
        END CASE;

      WHEN 'price' THEN
        CASE v_op
          WHEN 'equals' THEN v_clause := format('price_retail = %s', (v_value #>> '{}')::int);
          WHEN 'greater_than' THEN v_clause := format('price_retail > %s', (v_value #>> '{}')::int);
          WHEN 'less_than' THEN v_clause := format('price_retail < %s', (v_value #>> '{}')::int);
          WHEN 'between' THEN
            v_clause := format('price_retail BETWEEN %s AND %s',
              (v_value->0)::int, (v_value->1)::int);
          ELSE NULL;
        END CASE;

      WHEN 'material' THEN
        CASE v_op
          WHEN 'equals' THEN v_clause := format('materials @> ARRAY[%L]', v_value #>> '{}');
          WHEN 'contains' THEN v_clause := format('%L = ANY(materials)', v_value #>> '{}');
          WHEN 'in' THEN v_clause := format('materials && ARRAY(SELECT jsonb_array_elements_text(%L::jsonb))', v_value::text);
          ELSE NULL;
        END CASE;

      WHEN 'color' THEN
        CASE v_op
          WHEN 'equals' THEN v_clause := format('colors @> ARRAY[%L]', v_value #>> '{}');
          WHEN 'contains' THEN v_clause := format('%L = ANY(colors)', v_value #>> '{}');
          WHEN 'in' THEN v_clause := format('colors && ARRAY(SELECT jsonb_array_elements_text(%L::jsonb))', v_value::text);
          ELSE NULL;
        END CASE;

      WHEN 'tags' THEN
        CASE v_op
          WHEN 'contains' THEN v_clause := format('tags @> ARRAY[%L]', v_value #>> '{}');
          WHEN 'in' THEN v_clause := format('tags && ARRAY(SELECT jsonb_array_elements_text(%L::jsonb))', v_value::text);
          ELSE NULL;
        END CASE;

      WHEN 'status' THEN
        CASE v_op
          WHEN 'equals' THEN v_clause := format('status = %L', v_value #>> '{}');
          WHEN 'not_equals' THEN v_clause := format('status != %L', v_value #>> '{}');
          WHEN 'in' THEN v_clause := format('status = ANY(ARRAY(SELECT jsonb_array_elements_text(%L::jsonb)))', v_value::text);
          ELSE NULL;
        END CASE;

      WHEN 'finish' THEN
        CASE v_op
          WHEN 'equals' THEN v_clause := format('finish = %L', v_value #>> '{}');
          WHEN 'contains' THEN v_clause := format('finish ILIKE %L', '%' || (v_value #>> '{}') || '%');
          ELSE NULL;
        END CASE;

      ELSE
        -- Unknown field, skip
        NULL;
    END CASE;

    IF v_clause IS NOT NULL THEN
      v_where_clauses := array_append(v_where_clauses, v_clause);
    END IF;
  END LOOP;

  IF array_length(v_where_clauses, 1) IS NULL THEN
    RETURN jsonb_build_object('error', 'No valid conditions could be built');
  END IF;

  -- Build the final query
  v_query := 'SELECT id FROM products WHERE '
    || array_to_string(v_where_clauses, ' ' || v_operator || ' ');

  -- Insert matching products that aren't already in the collection
  EXECUTE format(
    'INSERT INTO collection_products (collection_id, product_id, position)
     SELECT %L, p.id, ROW_NUMBER() OVER (ORDER BY p.created_at DESC)
     FROM (%s) AS matched(id)
     JOIN products p ON p.id = matched.id
     WHERE NOT EXISTS (
       SELECT 1 FROM collection_products cp
       WHERE cp.collection_id = %L AND cp.product_id = matched.id
     )',
    p_collection_id, v_query, p_collection_id
  );
  GET DIAGNOSTICS v_added = ROW_COUNT;

  -- Remove products that no longer match
  EXECUTE format(
    'DELETE FROM collection_products
     WHERE collection_id = %L
       AND product_id NOT IN (%s)',
    p_collection_id, v_query
  );
  GET DIAGNOSTICS v_removed = ROW_COUNT;

  -- Update lastEvaluatedAt in the rule JSONB
  UPDATE collections
  SET rule = jsonb_set(
    COALESCE(rule, '{}'::jsonb),
    '{lastEvaluatedAt}',
    to_jsonb(NOW()::text)
  )
  WHERE id = p_collection_id;

  RETURN jsonb_build_object(
    'added', v_added,
    'removed', v_removed,
    'total', (SELECT COUNT(*) FROM collection_products WHERE collection_id = p_collection_id),
    'evaluatedAt', NOW()
  );
END;
$$;
