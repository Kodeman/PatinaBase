-- ═══════════════════════════════════════════════════════════════════════════
-- 00811 — US-37 client pricing privacy (SQ-1107, contract D6)
--
-- Cost, markup, margin, retail, price_basis and the cost-change flag never
-- reach a client. This migration closes the client paths the SQ-1107 audit
-- found still open on main 5748214d3 (00809 pricing core + 00807/00808).
--
-- Audit of EFFECTIVE client (authenticated, not on the project's team) and
-- anon access, latest migration per object:
--   project_ffe_items        00066 client SELECT dropped by 00434 and 00462.
--                            Live: 00066 lead-only FOR ALL; 00721 studio_rw
--                            via can_buy_for_project. No client row. Unchanged.
--   project_ffe_item_images  00807 can_buy_for_project only. Unchanged.
--   project_pricing_settings 00809 lead OR can_buy_for_project. Unchanged.
--   designer_pricing_settings 00809 own row only. Unchanged.
--   proposal_items           00390 proposal_items_legacy_ios_client_select is
--                            still live: the addressed client of an issued
--                            proposal reads every column through PostgREST,
--                            including unit_price (trade), markup_percent and
--                            client_product_snapshot.price_retail. CLOSED (§2).
--   furnishing_authorization_items
--                            00412 furnishing_authorization_items_studio_read
--                            authorizes via is_studio_comember(designer_id),
--                            whose 00556 body accepts ANY shared organization.
--                            A client who shares an unrelated org with the lead
--                            reads trade_unit_cost_cents and markup_percent off
--                            another studio's release snapshot (Astra SQ-1150
--                            R3). CLOSED (§1).
--   get_client_proposal_bundle
--                            00407 projects client_product_snapshot.price_retail
--                            at the 'full' tier. CLOSED (§3).
--
-- Every other curated client reader (get_client_project_selections,
-- get_client_project_threshold, get_client_commercial_document_bundle,
-- list_client_proposals, get_project_working_budget, ...) is an allowlist
-- projection with no such key; supabase/tests/ffe/us37_client_pricing_privacy_test.sql
-- proves it with a recursive key scan.
--
-- Policy-only plus one reader body: no GRANT or REVOKE, so the generated
-- seed/00-legacy-grants.sql is unaffected. CREATE OR REPLACE keeps the
-- reader's existing ACL (00407: authenticated only).
--
-- Lineage (redefined function):
--   get_client_proposal_bundle  00390 → 00407 → 00811 (00407 body verbatim,
--                               one delta: the price_retail key).
-- Reconciles: none. Nothing here locks FFE rows, so R182 does not apply.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Release snapshots: the project's team, not any shared organization ──
-- can_buy_for_project (00702) is the project-team authority every other FFE
-- surface uses (00721 project_ffe_items_studio_rw, 00807 images, 00809
-- project_pricing_settings): the lead or an active member of projects.studio_id;
-- a studio-less job keeps its 00717 co-member fallback. A client who merely
-- shares some other organization with the lead no longer qualifies.

DROP POLICY IF EXISTS furnishing_authorization_items_studio_read
  ON public.furnishing_authorization_items;
CREATE POLICY furnishing_authorization_items_studio_read
  ON public.furnishing_authorization_items
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.project_commercial_documents AS document
      WHERE document.id = furnishing_authorization_items.commercial_document_id
        AND public.can_buy_for_project(document.project_id)
    )
  );

COMMENT ON POLICY furnishing_authorization_items_studio_read
  ON public.furnishing_authorization_items IS
  '00811 (US-37 D6): the project''s team (can_buy_for_project), never a shared '
  'unrelated organization. Clients read release lines only through '
  'get_client_commercial_document_bundle, which projects client prices only.';

-- ── 2. Proposal lines: no raw client read ───────────────────────────────────
-- The web portal and the current iOS app read proposals only through
-- list_client_proposals / get_client_proposal_bundle (ProposalsMoneyRailTests
-- forbids raw .from("proposal_items")). The legacy policy served pre-00390 iOS
-- builds and exposed trade cost and markup on every line.

DROP POLICY IF EXISTS proposal_items_legacy_ios_client_select
  ON public.proposal_items;

-- ── 3. Client proposal bundle: no retail at any tier ────────────────────────

CREATE OR REPLACE FUNCTION public.get_client_proposal_bundle(
  p_proposal_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_payload jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'get_client_proposal_bundle requires authentication'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT jsonb_build_object(
    'proposal', jsonb_strip_nulls(jsonb_build_object(
      'id', proposal.id,
      'project_id', proposal.project_id,
      'project', CASE
        WHEN project.id IS NULL THEN NULL
        ELSE jsonb_build_object('id', project.id, 'name', project.name)
      END,
      'designer_id', proposal.designer_id,
      'title', proposal.title,
      'description', proposal.description,
      'project_address', proposal.project_address,
      'cover_image', proposal.cover_image,
      'total_amount', proposal.total_amount,
      'payment_terms', proposal.payment_terms,
      'payment_notes', proposal.payment_notes,
      'status', proposal.status,
      'valid_until', proposal.valid_until,
      'sent_at', proposal.sent_at,
      'signed_at', proposal.signed_at,
      'signed_by_name', proposal.signed_by_name,
      'declined_at', proposal.declined_at,
      'decline_reason', proposal.decline_reason,
      'created_at', proposal.created_at,
      'updated_at', proposal.updated_at,
      'version', proposal.version,
      'parent_proposal_id', proposal.parent_proposal_id,
      'revision_summary', proposal.revision_summary,
      'personal_message', proposal.personal_message,
      'client_visibility_tier', proposal.client_visibility_tier,
      'feedback_enabled', proposal.feedback_enabled,
      'client', jsonb_strip_nulls(jsonb_build_object(
        'full_name', client.full_name
      )),
      'items', CASE
        WHEN proposal.client_visibility_tier = 'curated' THEN '[]'::jsonb
        ELSE COALESCE((
          SELECT jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
            'id', item.id,
            'proposal_id', item.proposal_id,
            'name', item.name,
            'description', item.description,
            'image_url', item.image_url,
            'room', item.room,
            'category', item.category,
            'quantity', item.quantity,
            'unit_sell_price', CASE
              WHEN proposal.client_visibility_tier = 'full'
                THEN item.unit_sell_price
              ELSE NULL
            END,
            'line_total_cents', CASE
              WHEN proposal.client_visibility_tier = 'full'
                THEN item.line_total_cents
              ELSE NULL
            END,
            'vendor_name', CASE
              WHEN proposal.client_visibility_tier = 'full'
                THEN item.vendor_name
              ELSE NULL
            END,
            'lead_time_weeks', item.lead_time_weeks,
            'notes', item.notes,
            'position', item.position,
            'item_type', item.item_type,
            'scope_room_id', item.scope_room_id,
            'budget_min_cents', CASE
              WHEN proposal.client_visibility_tier = 'full'
                THEN item.budget_min_cents
              ELSE NULL
            END,
            'budget_max_cents', CASE
              WHEN proposal.client_visibility_tier = 'full'
                THEN item.budget_max_cents
              ELSE NULL
            END,
            'ffe_category', item.ffe_category,
            'doc_code', item.doc_code,
            'created_at', item.created_at,
            'updated_at', item.updated_at,
            'client_product_snapshot', jsonb_strip_nulls(jsonb_build_object(
              'name', item.client_product_snapshot->'name',
              'images', item.client_product_snapshot->'images',
              'brand', CASE
                WHEN proposal.client_visibility_tier = 'full'
                  THEN item.client_product_snapshot->'brand'
                ELSE NULL
              END,
              'source_url', CASE
                WHEN proposal.client_visibility_tier = 'full'
                  THEN item.client_product_snapshot->'source_url'
                ELSE NULL
              END,
              'dimensions', item.client_product_snapshot->'dimensions',
              'materials', item.client_product_snapshot->'materials',
              -- 00811 (US-37 D6): price_retail is no longer projected at any
              -- tier. Retail never reaches a client; the proposal's own
              -- unit_sell_price / line_total_cents are the client's prices.
              'has_teaching', item.client_product_snapshot->'has_teaching',
              'record_completeness_hidden', CASE
                WHEN proposal.client_visibility_tier = 'full' THEN NULL
                ELSE 'true'::jsonb
              END
            ))
          )) ORDER BY item.position, item.id)
          FROM public.proposal_items AS item
          WHERE item.proposal_id = proposal.id
            AND item.item_type <> 'tbd'
        ), '[]'::jsonb)
      END
    )),
    'sections', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', section.id,
        'proposal_id', section.proposal_id,
        'type', section.type,
        'title', section.title,
        'body', section.body,
        'metadata', CASE
          WHEN section.type = 'concept' THEN jsonb_strip_nulls(jsonb_build_object(
            'mood_board_urls', CASE
              WHEN jsonb_typeof(section.metadata->'mood_board_urls') = 'array'
                THEN COALESCE((
                  SELECT jsonb_agg(entry.value ORDER BY entry.ordinality)
                  FROM jsonb_array_elements(section.metadata->'mood_board_urls')
                    WITH ORDINALITY AS entry(value, ordinality)
                  WHERE jsonb_typeof(entry.value) = 'string'
                ), '[]'::jsonb)
              ELSE NULL
            END,
            'color_palette', CASE
              WHEN jsonb_typeof(section.metadata->'color_palette') = 'array'
                THEN COALESCE((
                  SELECT jsonb_agg(
                    jsonb_build_object('hex', swatch.value->'hex')
                    ORDER BY swatch.ordinality
                  )
                  FROM jsonb_array_elements(section.metadata->'color_palette')
                    WITH ORDINALITY AS swatch(value, ordinality)
                  WHERE jsonb_typeof(swatch.value) = 'object'
                    AND jsonb_typeof(swatch.value->'hex') = 'string'
                ), '[]'::jsonb)
              ELSE NULL
            END
          ))
          WHEN section.type = 'space_plan' THEN jsonb_strip_nulls(jsonb_build_object(
            'floor_plan_url', CASE
              WHEN jsonb_typeof(section.metadata->'floor_plan_url') = 'string'
                THEN section.metadata->'floor_plan_url'
              ELSE NULL
            END
          ))
          ELSE '{}'::jsonb
        END,
        'sort_order', section.sort_order
      ) ORDER BY section.sort_order, section.id)
      FROM public.proposal_sections AS section
      WHERE section.proposal_id = proposal.id
    ), '[]'::jsonb),
    'payment_milestones', CASE
      WHEN proposal.client_visibility_tier = 'curated' THEN '[]'::jsonb
      ELSE COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'id', milestone.id,
          'proposal_id', milestone.proposal_id,
          'phase_id', milestone.phase_id,
          'label', milestone.label,
          'percentage', milestone.percentage,
          'amount_cents', CASE
            WHEN proposal.client_visibility_tier IS DISTINCT FROM 'curated'
              THEN milestone.amount_cents
            ELSE NULL
          END,
          'trigger_condition', milestone.trigger_condition,
          'sort_order', milestone.sort_order
        ) ORDER BY milestone.sort_order, milestone.id)
        FROM public.proposal_payment_milestones AS milestone
        WHERE milestone.proposal_id = proposal.id
      ), '[]'::jsonb)
    END,
    'phases', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', phase.id,
        'proposal_id', phase.proposal_id,
        'name', phase.name,
        'duration_weeks', phase.duration_weeks,
        'sort_order', phase.sort_order
      ) ORDER BY phase.sort_order, phase.id)
      FROM public.proposal_phases AS phase
      WHERE phase.proposal_id = proposal.id
    ), '[]'::jsonb),
    'exclusions', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', exclusion.id,
        'proposal_id', exclusion.proposal_id,
        'description', exclusion.description,
        'category', exclusion.category,
        'sort_order', exclusion.sort_order
      ) ORDER BY exclusion.sort_order, exclusion.id)
      FROM public.proposal_exclusions AS exclusion
      WHERE exclusion.proposal_id = proposal.id
    ), '[]'::jsonb),
    'scope_rooms', COALESCE((
      SELECT jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
        'id', room.id,
        'proposal_id', room.proposal_id,
        'name', room.name,
        'room_type', room.room_type,
        'budget_cents', CASE
          WHEN proposal.client_visibility_tier = 'full'
            THEN room.budget_cents
          ELSE NULL
        END,
        'sort_order', room.sort_order
      )) ORDER BY room.sort_order, room.id)
      FROM public.proposal_scope_rooms AS room
      WHERE room.proposal_id = proposal.id
    ), '[]'::jsonb),
    'boards', CASE
      WHEN proposal.client_visibility_tier = 'curated' THEN '[]'::jsonb
      ELSE COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'id', board.id,
          'name', board.name,
          'cover_image_url', board.cover_image_url,
          'sort_order', board.sort_order,
          'canvas_width', board.canvas_width,
          'canvas_height', board.canvas_height,
          'background_color', board.background_color,
          'sections', CASE
            WHEN jsonb_typeof(board.sections) = 'array' THEN board.sections
            ELSE '[]'::jsonb
          END,
          'items', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
              'id', board_item.id,
              'type', board_item.type,
              'x', board_item.x,
              'y', board_item.y,
              'width', board_item.width,
              'height', board_item.height,
              'z_index', board_item.z_index,
              'rotation', board_item.rotation,
              'image_url', board_item.image_url,
              'content', board_item.content,
              'data', jsonb_strip_nulls(jsonb_build_object(
                'name', board_item.data->'name',
                'image_url', board_item.data->'image_url',
                'room_type', board_item.data->'room_type',
                'swatches', CASE
                  WHEN board_item.type = 'palette' THEN COALESCE((
                    SELECT jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
                      'hex', swatch.value->'hex',
                      'name', CASE
                        WHEN jsonb_typeof(swatch.value->'name') = 'string'
                          THEN swatch.value->'name'
                        ELSE NULL
                      END,
                      'role', CASE
                        WHEN jsonb_typeof(swatch.value->'role') = 'string'
                          THEN swatch.value->'role'
                        ELSE NULL
                      END
                    )) ORDER BY swatch.ordinality)
                    FROM jsonb_array_elements(
                      CASE
                        WHEN jsonb_typeof(board_item.data->'swatches') = 'array'
                          THEN board_item.data->'swatches'
                        ELSE '[]'::jsonb
                      END
                    ) WITH ORDINALITY AS swatch(value, ordinality)
                    WHERE jsonb_typeof(swatch.value) = 'object'
                      AND jsonb_typeof(swatch.value->'hex') = 'string'
                  ), '[]'::jsonb)
                  ELSE NULL
                END,
                'price_cents', CASE
                  WHEN proposal.client_visibility_tier = 'full'
                    THEN board_item.data->'price_cents'
                  ELSE NULL
                END,
                'vendor_name', CASE
                  WHEN proposal.client_visibility_tier = 'full'
                    THEN board_item.data->'vendor_name'
                  ELSE NULL
                END,
                'source_url', CASE
                  WHEN proposal.client_visibility_tier = 'full'
                    THEN board_item.data->'source_url'
                  ELSE NULL
                END,
                'lead_time_weeks', board_item.data->'lead_time_weeks',
                'section_id', board_item.data->'section_id'
              ))
            ) ORDER BY board_item.z_index, board_item.id)
            FROM public.proposal_board_items AS board_item
            WHERE board_item.board_id = board.id
          ), '[]'::jsonb)
        ) ORDER BY board.sort_order, board.id)
        FROM public.proposal_boards AS board
        WHERE board.proposal_id = proposal.id
          AND board.status = 'active'
      ), '[]'::jsonb)
    END
  )
  INTO v_payload
  FROM public.proposals AS proposal
  LEFT JOIN public.profiles AS client ON client.id = proposal.client_id
  LEFT JOIN public.projects AS project ON project.id = proposal.project_id
  WHERE proposal.id = p_proposal_id
    AND proposal.client_id = auth.uid()
    AND proposal.status IN ('sent', 'viewed', 'accepted', 'declined', 'expired');

  IF v_payload IS NULL THEN
    RAISE EXCEPTION 'proposal % not found or access denied', p_proposal_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN v_payload;
END;
$$;

COMMENT ON FUNCTION public.get_client_proposal_bundle(uuid) IS
  '00811 (US-37 D6): the client proposal bundle. Projects client prices only; '
  'never trade cost, markup, margin or retail (price_retail dropped from the '
  '''full'' tier).';
