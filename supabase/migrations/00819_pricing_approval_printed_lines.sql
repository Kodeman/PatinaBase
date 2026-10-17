-- ═══════════════════════════════════════════════════════════════════════════
-- 00819 · US-37 #4: a pricing approval records only the lines the client
--         edition printed a price for (SQ-1293, walk C F9)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- R188 (00810) says a spec book approval records each line whose client price
-- the approved client PDF printed. snapshot_project_pricing read every line of
-- the frozen render model: 'items', 'allowances' and 'tbd'. The PDF prints a
-- client price only on an item sheet (spec-book-render pdf.ts itemPage), and
-- only 'items' become item sheets. The Allowances and To Be Determined
-- schedules (the 00380 "allowances-tbd" page) print the label, the name and
-- the quantity, never a price. So an edition of placeholder lines (item_type
-- 'tbd': a line placed with no library piece) printed no price at all, yet the
-- approval recorded every one of them as approved at its price.
--
-- The fix: the writer reads the 'items' section only. A line in 'allowances'
-- or 'tbd' is never recorded, whatever its pricing says. Every other rule is
-- 00810's, unchanged: the line is visible to the client audience, the frozen
-- client profile allows clientPrice, the price is a JSON number, and the
-- quantity, total and currency are as frozen. The budget, addendum and
-- client_decision branches are unchanged.
--
-- Not changed: the render_snapshot builder and the renderer (SQ-1292 / 00818
-- own render_snapshot precision; this migration touches neither), and every
-- caller. The signature, SECURITY DEFINER, search_path and ACL are 00810's.
-- CREATE OR REPLACE keeps 00810's ACL (no PUBLIC, anon or authenticated
-- EXECUTE). There is no GRANT or REVOKE here, so the legacy-grants seed is
-- unchanged.
--
-- CONSTRAINT: a later redefinition of snapshot_project_pricing grafts from
-- this body, not 00810's, or it records unprinted lines again.
--
-- Measured by supabase/tests/ffe/us37_pricing_approval_printed_lines_test.sql.

CREATE OR REPLACE FUNCTION public.snapshot_project_pricing(
  p_project_id uuid,
  p_source text,
  p_ref uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_approval_id uuid;
  v_snapshot jsonb;
  v_profiles jsonb;
  v_allow jsonb;
BEGIN
  INSERT INTO public.ffe_pricing_approvals (project_id, approval_source, approval_ref, approved_by)
  VALUES (p_project_id, p_source, p_ref, auth.uid())
  RETURNING id INTO v_approval_id;

  IF p_source = 'project_approval' THEN
    -- The approved client edition's frozen render model; none for a budget,
    -- a drawing set or an addendum (00810 header).
    SELECT revision.render_snapshot INTO v_snapshot
    FROM public.project_approval_artifacts AS approval_artifact
    JOIN public.spec_book_artifacts AS artifact ON artifact.id = approval_artifact.source_id
    JOIN public.spec_book_revisions AS revision ON revision.id = artifact.revision_id
    JOIN public.spec_books AS book ON book.id = revision.spec_book_id
    WHERE approval_artifact.decision_id = p_ref
      AND approval_artifact.project_id = p_project_id
      AND approval_artifact.source_kind = 'spec_book_artifact'
      AND artifact.audience = 'client'
      AND book.project_id = p_project_id
      AND revision.status = 'issued'
      AND revision.issue_type <> 'addendum';

    IF v_snapshot IS NOT NULL THEN
      -- render-model.ts audienceAllowTokens: the frozen template's client
      -- profile; an explicit allow list replaces the default, which prints
      -- the client price.
      v_profiles := CASE
        WHEN jsonb_typeof(v_snapshot #> '{template,audienceProfiles}') = 'object'
          THEN v_snapshot #> '{template,audienceProfiles}'
        WHEN jsonb_typeof(v_snapshot #> '{template,audience_profiles}') = 'object'
          THEN v_snapshot #> '{template,audience_profiles}'
      END;
      v_allow := CASE
        WHEN jsonb_typeof(v_profiles #> '{client,allow}') = 'array'
          THEN v_profiles #> '{client,allow}'
      END;

      IF v_allow IS NULL OR v_allow ? 'clientPrice' OR v_allow ? '*' THEN
        INSERT INTO public.ffe_pricing_approval_lines (
          approval_id, item_id, unit_client_cents, quantity, line_total_cents, currency
        )
        SELECT DISTINCT ON (frozen.item_id)
          v_approval_id, frozen.item_id, frozen.unit_cents, frozen.quantity,
          frozen.unit_cents::bigint * frozen.quantity, frozen.currency
        FROM (
          SELECT
            line.item_key::uuid AS item_id,
            round((line.price #>> '{}')::numeric)::integer AS unit_cents,
            COALESCE(round((NULLIF(line.entry->'quantity', 'null'::jsonb) #>> '{}')::numeric)::integer, 1)
              AS quantity,
            CASE WHEN upper(line.pricing->>'currency') ~ '^[A-Z]{3}$'
              THEN upper(line.pricing->>'currency') ELSE 'USD' END AS currency,
            line.ordinality
          FROM (
            SELECT
              entry.value AS entry,
              entry.ordinality,
              COALESCE(entry.value->>'id', entry.value->>'ffeItemId', entry.value->>'ffe_item_id') AS item_key,
              pricing.value AS pricing,
              COALESCE(
                NULLIF(pricing.value->'clientPriceCents', 'null'::jsonb),
                NULLIF(pricing.value->'client_price_cents', 'null'::jsonb),
                NULLIF(pricing.value->'unitPriceCents', 'null'::jsonb),
                NULLIF(pricing.value->'unit_price_cents', 'null'::jsonb)
              ) AS price,
              COALESCE(NULLIF(entry.value->'audiences', 'null'::jsonb),
                       NULLIF(entry.value->'includedAudiences', 'null'::jsonb),
                       NULLIF(entry.value->'included_audiences', 'null'::jsonb)) AS audiences,
              COALESCE(NULLIF(entry.value->'audienceVisibility', 'null'::jsonb),
                       NULLIF(entry.value->'audience_visibility', 'null'::jsonb),
                       NULLIF(entry.value->'visibility', 'null'::jsonb)) AS visibility
            -- 00819 (SQ-1293): the item sheets only. The PDF prints a client
            -- price on an item sheet, and only 'items' become item sheets;
            -- the Allowances and To Be Determined schedules print the label,
            -- the name and the quantity, never a price.
            FROM jsonb_array_elements(
              CASE WHEN jsonb_typeof(v_snapshot->'items') = 'array'
                THEN v_snapshot->'items' ELSE '[]'::jsonb END
            ) WITH ORDINALITY AS entry(value, ordinality)
            CROSS JOIN LATERAL (
              SELECT CASE WHEN jsonb_typeof(entry.value->'pricing') = 'object'
                THEN entry.value->'pricing' ELSE entry.value END AS value
            ) AS pricing
          ) AS line
          WHERE line.item_key ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            AND jsonb_typeof(line.price) = 'number'
            -- render-model.ts itemVisibleToAudience, for the client.
            AND CASE
              WHEN jsonb_typeof(line.audiences) = 'array' THEN line.audiences ? 'client'
              WHEN jsonb_typeof(line.visibility->'client') = 'boolean'
                THEN (line.visibility->>'client')::boolean
              ELSE true
            END
        ) AS frozen
        ORDER BY frozen.item_id, frozen.ordinality;
      END IF;
    END IF;

  ELSIF p_source = 'client_decision' THEN
    -- The one line this product-option decision placed, at the option's own
    -- price and quantity. Options carry no currency; the branch writes USD.
    INSERT INTO public.ffe_pricing_approval_lines (
      approval_id, item_id, unit_client_cents, quantity, line_total_cents, currency
    )
    SELECT v_approval_id, item.id, option.price, COALESCE(option.quantity, 1),
           option.price::bigint * COALESCE(option.quantity, 1), 'USD'
    FROM public.client_decision_options AS option
    JOIN public.project_ffe_items AS item
      ON item.source_decision_id = option.decision_id
     AND item.project_id = p_project_id
    WHERE option.decision_id = p_ref
      AND option.selected
      AND option.price IS NOT NULL;
  END IF;

  RETURN v_approval_id;
END;
$$;

COMMENT ON FUNCTION public.snapshot_project_pricing(uuid, text, uuid) IS
  'Records a client approval of FF&E pricing (00810, 00819): an ffe_pricing_approvals row (approved_by = '
  'auth.uid()) and a line per item the client approved. project_approval: the approved client spec '
  'edition''s frozen render model, only lines whose client price it printed (its item sheets, never '
  'the Allowances or To Be Determined schedules); no lines for a budget or an addendum. '
  'client_decision: the decision''s own line at the selected option''s price. Never '
  'reads live FF&E prices. Internal; the caller holds the job label lock.';
