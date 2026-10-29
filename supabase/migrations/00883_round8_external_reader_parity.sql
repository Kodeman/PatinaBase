-- 00883 — External reader parity and C2 external-binding amendment holds.
-- Latest-body lineage: threshold 00840; USD guard 00661; derive 00758;
-- checkpoint 00835; working budget 00422; editorial 00852; frozen edition 00847; readiness 00834;
-- send 00876; edition mint 00869.
-- Countersign (00869) and reconciliation (00870) share _mint_scope_edition.
-- No activation, backfill, transfer, or change to studio commercial snapshots.

CREATE OR REPLACE FUNCTION public._external_presence_lines(p_project_id uuid,p_client_view boolean)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 -- Legacy budget callers authorize person-pairs, not the recorded project.
 -- Refuse rather than returning an apparently genuine empty external schedule.
 IF NOT p_client_view AND EXISTS (SELECT 1 FROM public.project_external_fulfilments
   WHERE project_id=p_project_id) THEN
  PERFORM public._external_assert_access(p_project_id);
 END IF;
 RETURN (SELECT COALESCE(jsonb_agg(jsonb_build_object(
  'id',item.id,'kind','external','responsibility','external',
  'externalFulfilmentId',f.id,'packageKey',f.package_key,
  'name',item.name,'threadId',item.selection_thread_id,'category',item.ffe_category,
  'roomId',item.project_room_id,'roomName',room.name,
  'quantity',item.quantity,'unit',item.unit,'itemType',item.item_type,
  'logisticsStatus',item.status,'updatedAt',item.updated_at,
  'clientUnitPriceCents',NULL,'clientLineTotalCents',NULL,
  'buyerPartyKind',f.buyer_party_kind,'payerPartyKind',f.payer_party_kind,
  'reportedPriceCents',CASE WHEN NOT p_client_view OR f.price_visibility='client_visible'
    THEN f.reported_price_cents END,
  'priceDescription','Bought by client/GC (not billed by studio)',
  'productId',item.product_id,'imageUrl',public.primary_image_url(item),
  'primaryImageUrl',public.primary_image_url(item),'imageUrls',to_jsonb(public.image_urls(item)),
  'docCode',item.doc_code
 ) ORDER BY room.sort_order NULLS FIRST,item.sort_order,item.created_at,item.id),'[]'::jsonb)
 FROM public.project_ffe_items item
 JOIN public.project_external_fulfilments f ON f.id=item.external_fulfilment_id AND f.project_id=item.project_id
 LEFT JOIN public.project_rooms room ON room.id=item.project_room_id
 WHERE item.project_id=p_project_id AND item.removed_at IS NULL
   AND item.design_disposition NOT IN ('not_selected','superseded'));
END;
$$;
REVOKE ALL ON FUNCTION public._external_presence_lines(uuid,boolean) FROM PUBLIC,anon,authenticated,service_role;

-- One responsibility rule serves the stored edition and the amendment's signed parts.
CREATE OR REPLACE FUNCTION public._external_rail_refusal(p_responsibilities jsonb,p_inclusion text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path=public,pg_temp AS $$
 SELECT CASE
  WHEN p_responsibilities->>'purchasing'='studio' THEN 'external_rail_studio_buyer'
  WHEN p_responsibilities->>'payer'='studio' OR p_responsibilities->>'fabrication_contract'='studio'
    THEN 'external_rail_studio_liability'
  WHEN p_responsibilities->>'payer'='none' THEN 'external_rail_payer_unknown'
  WHEN p_inclusion='included' AND p_responsibilities->>'purchasing' IN ('client','gc','other')
    AND p_responsibilities->>'payer' IN ('client','gc','other')
    AND p_responsibilities->>'fabrication_contract' IN ('client','gc','other','none') THEN NULL
  ELSE 'external_rail_responsibilities_invalid' END;
$$;
REVOKE ALL ON FUNCTION public._external_rail_refusal(jsonb,text) FROM PUBLIC,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION public._external_rail_refusal(p_edition_id uuid,p_package_key text)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT public._external_rail_refusal(p.responsibilities,p.inclusion)
 FROM (SELECT 1) seed LEFT JOIN public.project_scope_edition_packages p
 ON p.edition_id=p_edition_id AND p.package_key=p_package_key;
$$;

-- Callers already own project UPDATE, then proposal/document, then edition.
-- Project ownership serializes this read with C5 creation/lifecycle and with
-- conversion's project SHARE prelock; no label or item lock is added here.
CREATE OR REPLACE FUNCTION public._assert_scope_external_amendment(p_project_id uuid,p_parts jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE binding record;
BEGIN
 PERFORM 1 FROM public.project_scope_editions WHERE project_id=p_project_id
 ORDER BY edition_number DESC LIMIT 1 FOR SHARE;
 FOR binding IN
  SELECT f.id,f.package_key,EXISTS(SELECT 1 FROM public.project_external_fulfilment_events e
    WHERE e.fulfilment_id=f.id AND e.event_kind='contract_reported') AS contracted,
    f.status
  FROM public.project_external_fulfilments f
  WHERE f.project_id=p_project_id AND EXISTS (
   SELECT 1 FROM jsonb_array_elements(p_parts) part
   WHERE part->>'kind'='scope_package' AND part->'payload'->>'packageKey'=f.package_key
    AND public._external_rail_refusal(part->'payload'->'responsibilities',part->'payload'->>'inclusion')
     IN ('external_rail_studio_buyer','external_rail_studio_liability','external_rail_payer_unknown')
  ) AND (
   f.status<>'cancelled'
   OR EXISTS(SELECT 1 FROM public.project_ffe_items item WHERE item.external_fulfilment_id=f.id
     AND item.removed_at IS NULL AND item.design_disposition<>'superseded')
   OR (EXISTS(SELECT 1 FROM public.project_external_fulfilment_events e
        WHERE e.fulfilment_id=f.id AND e.event_kind='contract_reported')
     AND NOT EXISTS(SELECT 1 FROM public.project_external_fulfilment_events e
        WHERE e.fulfilment_id=f.id AND e.event_kind='cancelled' AND e.evidence_level='verified'))
  ) ORDER BY f.id
 LOOP
  IF binding.contracted AND (binding.status<>'cancelled' OR NOT EXISTS (
   SELECT 1 FROM public.project_external_fulfilment_events e WHERE e.fulfilment_id=binding.id
    AND e.event_kind='cancelled' AND e.evidence_level='verified')) THEN
   RAISE EXCEPTION 'scope_amendment_external_transfer_unowned' USING ERRCODE='check_violation',DETAIL=binding.package_key;
  END IF;
  RAISE EXCEPTION 'scope_amendment_external_binding_live' USING ERRCODE='check_violation',DETAIL=binding.package_key;
 END LOOP;
END;
$$;
REVOKE ALL ON FUNCTION public._assert_scope_external_amendment(uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role;

-- Grafted from 00661_ffe_extract_commercial_confirmation.sql
CREATE OR REPLACE FUNCTION public._ffe_require_usd_budget_rollup(p_project_id uuid)
RETURNS void LANGUAGE plpgsql STABLE SET search_path TO 'public','pg_temp' AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.project_ffe_items item
             WHERE item.project_id = p_project_id AND item.trade_scope_document_id IS NULL AND item.external_fulfilment_id IS NULL
               AND item.item_type = 'fixed' AND COALESCE(item.line_total_cents, 0) <> 0
               AND item.currency <> 'USD') THEN
    RAISE EXCEPTION 'the working budget is denominated in USD; a selection priced in another currency cannot be added into it'
      USING ERRCODE = 'check_violation';
  END IF;
END;
$$;

-- Grafted from 00422; only the C5-backed studio-read authority is added.
CREATE OR REPLACE FUNCTION public.get_project_working_budget(p_project_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_project public.projects%ROWTYPE;
  v_version public.project_budget_versions%ROWTYPE;
  v_checkpoint public.project_budget_checkpoints%ROWTYPE;
  v_is_studio boolean;
BEGIN
  SELECT * INTO v_project FROM public.projects WHERE id = p_project_id;
  IF NOT FOUND OR auth.uid() IS NULL OR NOT (
    v_project.client_id IS NOT DISTINCT FROM auth.uid()
    OR public.is_studio_comember(v_project.designer_id)
  ) THEN
    RAISE EXCEPTION 'project % not found or access denied', p_project_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  v_is_studio := public.is_studio_comember(v_project.designer_id);
  -- Preserve legacy/client budget authority, but never let a person-pair seat
  -- expose C5-backed studio readings across the project's recorded tenant.
  IF v_is_studio AND EXISTS (SELECT 1 FROM public.project_external_fulfilments
    WHERE project_id=p_project_id) THEN
    PERFORM public._external_assert_access(p_project_id);
  END IF;
  SELECT * INTO v_version FROM public.project_budget_versions
  WHERE project_id = p_project_id
    AND (status = 'published' OR public.is_studio_comember(v_project.designer_id))
  ORDER BY version DESC LIMIT 1;
  IF v_version.id IS NULL THEN RETURN NULL; END IF;
  SELECT * INTO v_checkpoint FROM public.project_budget_checkpoints
  WHERE budget_version_id = v_version.id;
  -- 00414: the version note is the studio's internal working commentary, and
  -- the override actor/reason is the studio's audited rationale for proceeding
  -- past an unacknowledged checkpoint. Neither is client copy. The client's own
  -- acknowledgement (acknowledgedBy/acknowledgedAt) stays — that is their act.
  RETURN jsonb_build_object(
    'version', jsonb_build_object(
      'id', v_version.id, 'projectId', v_version.project_id,
      'version', v_version.version, 'status', v_version.status,
      'lowTotalCents', v_version.low_total_cents,
      'targetTotalCents', v_version.target_total_cents,
      'highTotalCents', v_version.high_total_cents,
      'currency', 'USD', 'note', v_version.note,
      'liveAuthorizedTotalCents', COALESCE((
        SELECT SUM(a.client_line_total_cents)
        FROM public.furnishing_authorization_items a
        JOIN public.project_commercial_documents d ON d.id = a.commercial_document_id
        JOIN public.proposals p ON p.id = d.proposal_id
        WHERE d.project_id = p_project_id
          AND d.executed_at IS NOT NULL
          AND p.commercial_state = 'executed'
      ), 0),
      'createdAt', v_version.created_at, 'publishedAt', v_version.published_at
    ) - CASE WHEN v_is_studio THEN '{}'::text[] ELSE ARRAY['note'] END,
    'lines', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'id', l.id, 'projectRoomId', l.project_room_id, 'roomName', l.room_name,
      'category', l.category, 'lowCents', l.low_cents,
      'targetCents', l.target_cents, 'highCents', l.high_cents,
      'scheduledCents', l.scheduled_cents, 'authorizedCents', l.authorized_cents,
      -- The publish stamp's `authorized` rollup, run at read time instead of at
      -- publication. Kept character-for-character the same shape on purpose: if
      -- one of the two ever needs a fix, the other needs the identical fix.
      'liveAuthorizedCents', COALESCE((
        SELECT SUM(a.client_line_total_cents)
        FROM public.furnishing_authorization_items a
        JOIN public.project_commercial_documents d ON d.id = a.commercial_document_id
        JOIN public.proposals p ON p.id = d.proposal_id
        WHERE d.project_id = p_project_id
          AND d.executed_at IS NOT NULL
          AND p.commercial_state = 'executed'
          AND CASE
                WHEN l.project_room_id IS NOT NULL AND a.project_room_id IS NOT NULL
                  THEN a.project_room_id = l.project_room_id
                ELSE COALESCE(a.room_name, '') = l.room_name
              END
          AND COALESCE(a.category, 'Uncategorized') = l.category
      ), 0),
      'sortOrder', l.sort_order
    ) ORDER BY l.sort_order, l.id) FROM public.project_budget_lines l
      WHERE l.budget_version_id = v_version.id), '[]'::jsonb),
    'checkpoint', CASE WHEN v_checkpoint.id IS NULL THEN NULL ELSE jsonb_build_object(
      'id', v_checkpoint.id, 'projectId', v_checkpoint.project_id,
      'versionId', v_checkpoint.budget_version_id,
      'checkpointCode', v_checkpoint.checkpoint_code,
      'status', v_checkpoint.status, 'snapshotFingerprint', v_checkpoint.snapshot_fingerprint,
      'publishedAt', v_checkpoint.published_at,
      'acknowledgedBy', v_checkpoint.acknowledged_by,
      'acknowledgedAt', v_checkpoint.acknowledged_at,
      'overrideBy', v_checkpoint.override_by,
      'overrideReason', v_checkpoint.override_reason,
      'overriddenAt', v_checkpoint.overridden_at
    ) - CASE WHEN v_is_studio THEN '{}'::text[]
             ELSE ARRAY['overrideBy', 'overrideReason'] END
    END,
    'isPurchaseAuthority', false
  );
END;
$$;

-- Grafted from 00758_pieces_w5_review_fixes.sql
CREATE OR REPLACE FUNCTION public._derive_working_budget_draft_00661_impl(p_project_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_project public.projects%ROWTYPE;
  v_version public.project_budget_versions%ROWTYPE;
BEGIN
  SELECT * INTO v_project FROM public.projects WHERE id = p_project_id FOR SHARE;
  IF NOT FOUND OR v_actor IS NULL
     OR NOT public.is_studio_comember(v_project.designer_id) THEN
    RAISE EXCEPTION 'project % not found or access denied', p_project_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_version FROM public.project_budget_versions
  WHERE project_id = p_project_id
  ORDER BY version DESC LIMIT 1 FOR UPDATE;
  IF v_version.id IS NULL OR v_version.status <> 'draft' THEN
    INSERT INTO public.project_budget_versions (project_id, version, created_by)
    VALUES (p_project_id, COALESCE(v_version.version, 0) + 1, v_actor)
    RETURNING * INTO v_version;
  END IF;

  -- Additive only. A studio target the designer typed is a JUDGEMENT; the
  -- schedule rollup is an OBSERVATION. Re-deriving must never overwrite the
  -- judgement, so an existing (version, room, category) line is left alone and
  -- only genuinely new room×category pairs appear.
  --
  -- The conflict key is the ROOM ID, not the room name: two rooms both called
  -- "Bedroom" are two rooms, and the old name key silently discarded the
  -- second one's rollup — leaving its schedule lines permanently un-releasable
  -- against an id-keyed coverage proof.
  INSERT INTO public.project_budget_lines (
    budget_version_id, project_room_id, room_name, category,
    low_cents, target_cents, high_cents, sort_order
  )
  SELECT
    v_version.id, rollup.room_id, rollup.room_name, rollup.category,
    0,
    public._cents_to_int4(rollup.target,
      format('the scheduled rollup for %s · %s', rollup.room_name, rollup.category)),
    0,
    rollup.sort_order
  FROM (
    -- 00757 delta: the rollup sums each line's room SLICES, not the line. A
    -- placed line (2+ placements) is one slice per placement room, by share;
    -- any other line is one slice in project_room_id. Same copy as
    -- _publish_budget_checkpoint_00661_impl's `slice`.
    WITH line AS (
      SELECT
        item.id, item.project_room_id,
        COALESCE(item.ffe_category, 'Uncategorized') AS category,
        (CASE
          WHEN item.item_type = 'fixed' THEN COALESCE(item.line_total_cents, 0)
          WHEN item.item_type = 'allowance' THEN COALESCE(item.budget_max_cents, 0)
          ELSE 0 END)::numeric AS amount
      FROM public.project_ffe_items item
      WHERE item.project_id = p_project_id
        -- 00423 delta: a trade scope's presence lines are not furnishings, and
        -- this is a FURNISHING budget. Without this predicate the rollup mints a
        -- 'trade work' budget line out of them — which is also what let the
        -- presence lines into publish_budget_checkpoint's scheduled stamp, since
        -- that stamp matches a schedule line to a budget line on category.
        AND item.trade_scope_document_id IS NULL
        AND item.external_fulfilment_id IS NULL
        -- 00758 (F14): only live lines. A removed line, a superseded one
        -- (its successor carries the money) and a not-selected one (the
        -- designer passed on it; release needs 'selected') are not scheduled.
        AND item.removed_at IS NULL
        AND item.design_disposition NOT IN ('not_selected', 'superseded')
    ), placed AS (
      SELECT
        pl.ffe_item_id, pl.project_room_id, pl.quantity,
        row_number() OVER (PARTITION BY pl.ffe_item_id
                           ORDER BY pl.sort_order, pl.created_at, pl.id) AS ord,
        sum(pl.quantity) OVER (PARTITION BY pl.ffe_item_id) AS placed_sum,
        count(*) OVER (PARTITION BY pl.ffe_item_id) AS placed_count
      FROM public.project_ffe_placements pl
      WHERE pl.project_id = p_project_id
    ), share AS (
      -- floor(amount × quantity / placed_sum), and its remainder numerator
      -- (a floor mod, so a negative amount still rounds down).
      SELECT
        line.id, line.category, line.amount, placed.project_room_id, placed.ord,
        mod(mod(line.amount * placed.quantity, placed.placed_sum) + placed.placed_sum,
            placed.placed_sum) AS rem,
        placed.quantity, placed.placed_sum
      FROM line
      JOIN placed ON placed.ffe_item_id = line.id AND placed.placed_count >= 2
    ), ranked AS (
      SELECT
        share.*,
        (share.amount * share.quantity - share.rem) / share.placed_sum AS base,
        row_number() OVER (PARTITION BY share.id ORDER BY share.rem DESC, share.ord) AS rem_rank
      FROM share
    ), slice AS (
      SELECT
        ranked.project_room_id, ranked.category,
        (ranked.base + CASE
          WHEN ranked.rem_rank <= ranked.amount
               - sum(ranked.base) OVER (PARTITION BY ranked.id) THEN 1
          ELSE 0 END)::integer AS amount
      FROM ranked
      UNION ALL
      SELECT line.project_room_id, line.category, line.amount::integer
      FROM line
      WHERE NOT EXISTS (
        SELECT 1 FROM placed
        WHERE placed.ffe_item_id = line.id AND placed.placed_count >= 2
      )
    )
    SELECT
      room.id AS room_id, room.name AS room_name,
      slice.category AS category,
      room.sort_order AS sort_order,
      SUM(slice.amount)::bigint AS target
    FROM slice
    JOIN public.project_rooms room ON room.id = slice.project_room_id
    GROUP BY room.id, room.name, slice.category, room.sort_order
  ) rollup
  -- A legacy line carrying no project_room_id still owns its (name, category)
  -- pair on this version. Re-deriving must not shadow that judgement with a
  -- second, id-keyed line for the same room and category.
  WHERE NOT EXISTS (
    SELECT 1 FROM public.project_budget_lines legacy
    WHERE legacy.budget_version_id = v_version.id
      AND legacy.project_room_id IS NULL
      AND legacy.room_name = rollup.room_name
      AND legacy.category = rollup.category
  )
  ON CONFLICT (budget_version_id, project_room_id, category)
    WHERE project_room_id IS NOT NULL
  DO NOTHING;

  RETURN public.get_project_working_budget(p_project_id)
    || jsonb_build_object('externalSelections',public._external_presence_lines(p_project_id,false));
END;
$$;

-- Grafted from 00835_external_signed_agreements.sql
CREATE OR REPLACE FUNCTION public._publish_budget_checkpoint_00661_impl(
  p_project_id uuid,
  p_version_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_version public.project_budget_versions%ROWTYPE;
  v_checkpoint public.project_budget_checkpoints%ROWTYPE;
  v_low bigint;
  v_target bigint;
  v_high bigint;
  v_stamp record;
  v_fingerprint text;
  v_previous_publish text := current_setting('app.budget_publish_id', true);
BEGIN
  SELECT v.* INTO v_version
  FROM public.project_budget_versions v
  JOIN public.projects p ON p.id = v.project_id
  WHERE v.id = p_version_id AND v.project_id = p_project_id
    AND public.is_studio_comember(p.designer_id)
  FOR UPDATE OF v;
  IF NOT FOUND OR v_actor IS NULL OR v_version.status <> 'draft' THEN
    RAISE EXCEPTION 'draft budget version % not found or access denied', p_version_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  -- 00414: a checkpoint is an act of signed commercial authority — it is what a
  -- furnishing wave is built on. A legacy project has no such authority, so it
  -- can no longer publish one.
  IF NOT public.project_has_design_agreement_eligibility(p_project_id) THEN
    RAISE EXCEPTION 'project % has no executed design-services origin', p_project_id
      USING ERRCODE = 'check_violation';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.project_budget_lines l WHERE l.budget_version_id = p_version_id) THEN
    RAISE EXCEPTION 'budget version % has no lines', p_version_id
      USING ERRCODE = 'check_violation';
  END IF;

  -- 00422: freeze the coverage picture INTO the version, so the checkpoint the
  -- client acknowledges says what was scheduled and what was already authorized
  -- against each line — not just what was targeted.
  --
  -- Both rollups match on the ROOM ID wherever both sides carry one, and fall
  -- back to the name only for a legacy row that has no id (a budget line filed
  -- before 00412's project_room_id, or a proposal-sourced snapshot that never
  -- had one). Matching on name alone double-counted every pair of rooms that
  -- happened to share a name, and froze that inflated figure into the hash the
  -- client acknowledges. Written as a loop, not one UPDATE, so the narrowing to
  -- the integer columns can name which rollup overflowed.
  FOR v_stamp IN
    -- 00757 delta: the `scheduled` rollup sums each line's room SLICES, not
    -- the line. A placed line (2+ placements) is one slice per placement
    -- room, by share; any other line is one slice in project_room_id. Same
    -- copy as _derive_working_budget_draft_00661_impl's `slice`. The
    -- `authorized` rollup is untouched: it reads the frozen release snapshot.
    WITH line AS (
      SELECT
        i.id, i.project_room_id,
        COALESCE(i.ffe_category, 'Uncategorized') AS category,
        (CASE
          WHEN i.item_type = 'fixed' THEN COALESCE(i.line_total_cents, 0)
          WHEN i.item_type = 'allowance' THEN COALESCE(i.budget_max_cents, 0)
          ELSE 0 END)::numeric AS amount
      FROM public.project_ffe_items i
      WHERE i.project_id = p_project_id
        -- 00423 delta: same exclusion as derive_working_budget_draft, and it
        -- is load-bearing independently. derive is not the only way a
        -- 'trade work' budget line can exist — a studio can type any category
        -- by hand, and a version derived before 00423 already carries one —
        -- so the stamp must refuse the presence lines on its own account.
        AND i.trade_scope_document_id IS NULL
        AND i.external_fulfilment_id IS NULL
        -- 00758 (F14): only live lines. A removed line, a superseded one
        -- (its successor carries the money) and a not-selected one (the
        -- designer passed on it; release needs 'selected') are not scheduled.
        AND i.removed_at IS NULL
        AND i.design_disposition NOT IN ('not_selected', 'superseded')
    ), placed AS (
      SELECT
        pl.ffe_item_id, pl.project_room_id, pl.quantity,
        row_number() OVER (PARTITION BY pl.ffe_item_id
                           ORDER BY pl.sort_order, pl.created_at, pl.id) AS ord,
        sum(pl.quantity) OVER (PARTITION BY pl.ffe_item_id) AS placed_sum,
        count(*) OVER (PARTITION BY pl.ffe_item_id) AS placed_count
      FROM public.project_ffe_placements pl
      WHERE pl.project_id = p_project_id
    ), share AS (
      -- floor(amount × quantity / placed_sum), and its remainder numerator
      -- (a floor mod, so a negative amount still rounds down).
      SELECT
        line.id, line.category, line.amount, placed.project_room_id, placed.ord,
        mod(mod(line.amount * placed.quantity, placed.placed_sum) + placed.placed_sum,
            placed.placed_sum) AS rem,
        placed.quantity, placed.placed_sum
      FROM line
      JOIN placed ON placed.ffe_item_id = line.id AND placed.placed_count >= 2
    ), ranked AS (
      SELECT
        share.*,
        (share.amount * share.quantity - share.rem) / share.placed_sum AS base,
        row_number() OVER (PARTITION BY share.id ORDER BY share.rem DESC, share.ord) AS rem_rank
      FROM share
    ), slice AS (
      SELECT
        ranked.project_room_id, ranked.category,
        (ranked.base + CASE
          WHEN ranked.rem_rank <= ranked.amount
               - sum(ranked.base) OVER (PARTITION BY ranked.id) THEN 1
          ELSE 0 END)::integer AS amount
      FROM ranked
      UNION ALL
      SELECT line.project_room_id, line.category, line.amount::integer
      FROM line
      WHERE NOT EXISTS (
        SELECT 1 FROM placed
        WHERE placed.ffe_item_id = line.id AND placed.placed_count >= 2
      )
    )
    SELECT
      l.id AS line_id, l.room_name AS room_name, l.category AS category,
      COALESCE((
        SELECT SUM(s.amount)
        FROM slice s
        LEFT JOIN public.project_rooms r ON r.id = s.project_room_id
        WHERE CASE
                WHEN l.project_room_id IS NOT NULL AND s.project_room_id IS NOT NULL
                  THEN s.project_room_id = l.project_room_id
                ELSE COALESCE(r.name, '') = l.room_name
              END
          AND s.category = l.category
      ), 0) AS scheduled,
      COALESCE((
        SELECT SUM(a.client_line_total_cents)
        FROM public.furnishing_authorization_items a
        JOIN public.project_commercial_documents d ON d.id = a.commercial_document_id
        JOIN public.proposals p ON p.id = d.proposal_id
        WHERE d.project_id = p_project_id
          AND d.executed_at IS NOT NULL
          AND p.commercial_state = 'executed'
          AND CASE
                WHEN l.project_room_id IS NOT NULL AND a.project_room_id IS NOT NULL
                  THEN a.project_room_id = l.project_room_id
                ELSE COALESCE(a.room_name, '') = l.room_name
              END
          AND COALESCE(a.category, 'Uncategorized') = l.category
      ), 0) AS authorized
    FROM public.project_budget_lines l
    WHERE l.budget_version_id = p_version_id
  LOOP
    UPDATE public.project_budget_lines SET
      scheduled_cents = public._cents_to_int4(v_stamp.scheduled,
        format('the scheduled rollup for %s · %s', v_stamp.room_name, v_stamp.category)),
      authorized_cents = public._cents_to_int4(v_stamp.authorized,
        format('the authorized rollup for %s · %s', v_stamp.room_name, v_stamp.category))
    WHERE id = v_stamp.line_id;
  END LOOP;

  SELECT sum(low_cents), sum(target_cents), sum(high_cents)
  INTO v_low, v_target, v_high
  FROM public.project_budget_lines WHERE budget_version_id = p_version_id;

  PERFORM set_config('app.budget_publish_id', p_version_id::text, true);
  UPDATE public.project_budget_versions SET
    low_total_cents = public._cents_to_int4(v_low, 'this budget version''s low total'),
    target_total_cents = public._cents_to_int4(v_target, 'this budget version''s target total'),
    high_total_cents = public._cents_to_int4(v_high, 'this budget version''s high total'),
    status = 'published', published_at = now()
  WHERE id = p_version_id RETURNING * INTO v_version;
  v_fingerprint := public._budget_version_fingerprint(p_version_id);

  INSERT INTO public.project_budget_checkpoints (
    project_id, budget_version_id, checkpoint_code, snapshot_fingerprint,
    published_by, published_at
  ) VALUES (
    p_project_id, p_version_id, 'B-' || lpad(v_version.version::text, 3, '0'),
    v_fingerprint, v_actor, v_version.published_at
  ) RETURNING * INTO v_checkpoint;
  PERFORM set_config('app.budget_publish_id', COALESCE(v_previous_publish, ''), true);

  RETURN jsonb_build_object(
    'checkpointId', v_checkpoint.id,
    'projectId', p_project_id,
    'versionId', p_version_id,
    'checkpointCode', v_checkpoint.checkpoint_code,
    'status', v_checkpoint.status,
    'snapshotFingerprint', v_checkpoint.snapshot_fingerprint,
    'publishedAt', v_checkpoint.published_at,
    'externalSelections',public._external_presence_lines(p_project_id,false)
  );
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('app.budget_publish_id', COALESCE(v_previous_publish, ''), true);
  RAISE;
END;
$$;

-- Grafted from 00840_client_wall_signed_name.sql
CREATE OR REPLACE FUNCTION public.get_client_project_threshold(p_project_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_project public.projects%ROWTYPE;
BEGIN
  -- 00441's preamble, with the access test repaired (SQ-1128 F1/F2): null-safe
  -- (a NULL client_id never passes) and bound to the job's own studio. 00755
  -- asked is_studio_comember(designer_id).
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO v_project FROM public.projects WHERE id = p_project_id;
  IF NOT FOUND OR NOT COALESCE(
    v_project.client_id = v_actor
    OR public.can_buy_for_project(v_project.id),
    false
  ) THEN
    RAISE EXCEPTION 'project not found or not accessible'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN jsonb_build_object(
    'projectId', v_project.id,
    'projectName', v_project.name,
    -- 00423's origin test: the project stands on a signed design-services
    -- instrument, or it is a legacy project the commercial rail never touched.
    'origin', CASE WHEN EXISTS (
      SELECT 1 FROM public.project_commercial_documents AS doc
      WHERE doc.project_id = p_project_id
        AND doc.is_origin
        AND doc.document_kind IN ('design_services', 'design_build')
    ) THEN 'commercial' ELSE 'legacy' END,

    -- ── furnishings: the FROZEN authorization snapshot the client signed ──
    -- Money comes from furnishing_authorization_items.client_* — the columns
    -- the client put her name to — never from the live working row.
    'selections', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', item.id,
        'kind', 'furnishings',
        'threadId', item.selection_thread_id,
        -- 00840: the name she signed (00839 clientName, the Pieces lens name);
        -- a line signed before 00839 keeps its working name.
        'name', COALESCE(authorization_item.snapshot->>'clientName', item.name),
        'category', item.ffe_category,
        'assignmentScope', item.assignment_scope,
        'roomId', item.project_room_id,
        'roomName', COALESCE(room.name, authorization_item.room_name),
        'conceptRenderUrl', room.concept_render_url,
        'conceptRenderCaption', room.concept_render_caption,
        'conceptRenderUploadedAt', room.concept_render_uploaded_at,
        'conceptRenderUploadedBy', room.concept_render_uploaded_by,
        'quantity', authorization_item.quantity,
        -- 00745: additive. The rooms she signed, from the frozen snapshot.
        'unit', line_unit.unit,
        'rooms', public._client_line_rooms(
          item.id, true, authorization_item.snapshot,
          -- 00755 (F-E3): the frozen room name first.
          COALESCE(authorization_item.room_name, room.name),
          authorization_item.quantity, line_unit.unit),
        'clientUnitPriceCents', authorization_item.client_unit_price_cents,
        'clientLineTotalCents', authorization_item.client_line_total_cents,
        'itemType', item.item_type,
        'logisticsStatus', item.status,
        'updatedAt', GREATEST(item.updated_at, item.last_status_change_at, doc.executed_at),
        'tradeJourney', NULL,
        -- The block exists because the CLIENT signed an allowance — that is the
        -- frozen snapshot's business (authorization_item.item_type), and it
        -- never changes.
        --
        -- 00423 resolved it off the LIVE schedule line (item.item_type = 'fixed'
        -- → item.line_total_cents). That is the one path on which the restored
        -- payload would still have handed the client an unsigned working-row
        -- figure the studio can move under her, and it is withdrawn here: an
        -- allowance is RESOLVED when a later EXECUTED authorization snapshots the
        -- same live line as 'fixed', and the resolved figure is that snapshot's
        -- own client_line_total_cents. Until such an instrument exists the
        -- allowance is unresolved and this is null.
        'allowance', CASE WHEN authorization_item.item_type = 'allowance' THEN jsonb_build_object(
          'ceilingCents', authorization_item.client_line_total_cents,
          'resolvedCents', (
            SELECT resolution.client_line_total_cents
            FROM public.furnishing_authorization_items AS resolution
            JOIN public.project_commercial_documents AS resolution_doc
              ON resolution_doc.id = resolution.commercial_document_id
             AND resolution_doc.executed_at IS NOT NULL
            JOIN public.proposals AS resolution_proposal
              ON resolution_proposal.id = resolution_doc.proposal_id
             AND resolution_proposal.commercial_state = 'executed'
            WHERE resolution.source_ffe_item_id = item.id
              AND resolution.item_type = 'fixed'
            ORDER BY resolution_doc.executed_at DESC, resolution.id
            LIMIT 1
          )
        ) ELSE NULL END,
        'instrument', jsonb_build_object(
          'documentId', doc.id,
          'proposalId', proposal.id,
          'name', doc.wave_name,
          'executedAt', doc.executed_at
        ),
        'productId', item.product_id,
        -- 00807: the item's own primary picture, no longer the live product's
        -- first image; and every picture in order.
        'imageUrl', item_primary.url,
        'primaryImageUrl', item_primary.url,
        'imageUrls', to_jsonb(public.image_urls(item)),
        'docCode', item.doc_code
      ) ORDER BY room.sort_order NULLS FIRST, item.sort_order, item.created_at, item.id)
      FROM public.project_ffe_items AS item
      JOIN public.furnishing_authorization_items AS authorization_item
        ON authorization_item.id = item.source_authorization_item_id
      JOIN public.project_commercial_documents AS doc
        ON doc.id = authorization_item.commercial_document_id
       AND doc.executed_at IS NOT NULL
      JOIN public.proposals AS proposal
        ON proposal.id = doc.proposal_id
       AND proposal.commercial_state = 'executed'
      LEFT JOIN public.project_rooms AS room ON room.id = item.project_room_id
      CROSS JOIN LATERAL (
        -- 00755 (F-E4): the snapshot's unit, defaulting to 'each'.
        SELECT COALESCE(authorization_item.snapshot->>'unit', 'each') AS unit
      ) AS line_unit
      -- The primary picture, looked up once per line (SQ-1143).
      CROSS JOIN LATERAL (SELECT public.primary_image_url(item) AS url) AS item_primary
      WHERE item.project_id = p_project_id
        AND item.external_fulfilment_id IS NULL
        AND item.removed_at IS NULL
        AND item.design_disposition NOT IN ('not_selected', 'superseded')
    ), '[]'::jsonb)

    -- ── trade: the presence line under an executed trade scope ────────────
    -- clientLineTotalCents reads the live row on purpose: 00423's
    -- guard_trade_presence_line_lock freezes exactly that money once the scope
    -- is executed, which is why this branch has no snapshot table of its own.
    || COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', item.id,
        'kind', 'trade',
        'threadId', item.selection_thread_id,
        'name', item.name,
        'category', item.ffe_category,
        'assignmentScope', item.assignment_scope,
        'roomId', item.project_room_id,
        'roomName', COALESCE(room.name, section.room_name),
        'conceptRenderUrl', room.concept_render_url,
        'conceptRenderCaption', room.concept_render_caption,
        'conceptRenderUploadedAt', room.concept_render_uploaded_at,
        'conceptRenderUploadedBy', room.concept_render_uploaded_by,
        'quantity', item.quantity,
        -- 00745: additive. No snapshot table on this branch: the live line.
        'unit', item.unit,
        'rooms', public._client_line_rooms(
          item.id, false, NULL,
          COALESCE(room.name, section.room_name),
          item.quantity, item.unit),
        'clientUnitPriceCents', NULL,
        'clientLineTotalCents', item.line_total_cents,
        'itemType', item.item_type,
        'logisticsStatus', item.status,
        'updatedAt', GREATEST(item.updated_at, item.last_status_change_at, doc.executed_at),
        'tradeJourney', terms.progress_state,
        'allowance', NULL,
        'instrument', jsonb_build_object(
          'documentId', doc.id,
          'proposalId', proposal.id,
          'name', proposal.title,
          'executedAt', doc.executed_at
        ),
        'productId', item.product_id,
        -- 00807: the item's own primary picture, no longer the live product's
        -- first image; and every picture in order.
        'imageUrl', item_primary.url,
        'primaryImageUrl', item_primary.url,
        'imageUrls', to_jsonb(public.image_urls(item)),
        'docCode', item.doc_code
      ) ORDER BY room.sort_order NULLS FIRST, item.sort_order, item.created_at, item.id)
      FROM public.project_ffe_items AS item
      JOIN public.project_commercial_documents AS doc
        ON doc.id = item.trade_scope_document_id
       AND doc.executed_at IS NOT NULL
      JOIN public.proposals AS proposal
        ON proposal.id = doc.proposal_id
       AND proposal.commercial_state = 'executed'
      JOIN public.trade_scope_terms AS terms ON terms.proposal_id = proposal.id
      LEFT JOIN public.project_rooms AS room ON room.id = item.project_room_id
      LEFT JOIN LATERAL (
        SELECT scope_section.room_name
        FROM public.trade_scope_sections AS scope_section
        WHERE scope_section.proposal_id = proposal.id
          AND scope_section.project_room_id IS NOT DISTINCT FROM item.project_room_id
        ORDER BY scope_section.sort_order, scope_section.id
        LIMIT 1
      ) AS section ON true
      -- The primary picture, looked up once per line (SQ-1143).
      CROSS JOIN LATERAL (SELECT public.primary_image_url(item) AS url) AS item_primary
      WHERE item.project_id = p_project_id
        AND item.external_fulfilment_id IS NULL
        AND item.removed_at IS NULL
        AND item.design_disposition NOT IN ('not_selected', 'superseded')
    ), '[]'::jsonb)
    || public._external_presence_lines(p_project_id,true)
  );
END;
$$;

-- Grafted from 00852_client_plate_installed_lane.sql
CREATE OR REPLACE FUNCTION public._build_project_editorial(p_project_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_project public.projects%ROWTYPE;
  v_studio_id uuid;
  v_studio_name text;
  v_studio_town text;
  v_result jsonb;
BEGIN
  SELECT * INTO v_project FROM public.projects WHERE id = p_project_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT studio.studio_id, studio.name
  INTO v_studio_id, v_studio_name
  FROM public.resolve_studio_identity(p_project_id => v_project.id) AS studio;
  IF v_studio_id IS NOT NULL THEN
    SELECT NULLIF(btrim(org.address ->> 'city'), '')
    INTO v_studio_town
    FROM public.organizations AS org
    WHERE org.id = v_studio_id;
  END IF;

  WITH
  -- The lines the client page already shows her (00840, both branches).
  line AS (
    SELECT item.id, item.project_room_id, item.ffe_category, item.status,
           item.external_fulfilment_id,
           item.sort_order, item.created_at,
           COALESCE(authorization_item.snapshot ->> 'clientName', item.name) AS name_as_signed,
           COALESCE(vendor.name, item.vendor_name) AS maker_name,
           vendor.made_in
    FROM public.project_ffe_items AS item
    JOIN public.furnishing_authorization_items AS authorization_item
      ON authorization_item.id = item.source_authorization_item_id
    JOIN public.project_commercial_documents AS doc
      ON doc.id = authorization_item.commercial_document_id
     AND doc.executed_at IS NOT NULL
    JOIN public.proposals AS proposal
      ON proposal.id = doc.proposal_id
     AND proposal.commercial_state = 'executed'
    LEFT JOIN public.vendors AS vendor ON vendor.id = item.vendor_id
    WHERE item.project_id = p_project_id
      AND item.removed_at IS NULL
      AND item.design_disposition NOT IN ('not_selected', 'superseded')
    UNION ALL
    SELECT item.id, item.project_room_id, item.ffe_category, item.status,
           item.external_fulfilment_id,
           item.sort_order, item.created_at,
           item.name,
           COALESCE(vendor.name, item.vendor_name),
           vendor.made_in
    FROM public.project_ffe_items AS item
    JOIN public.project_commercial_documents AS doc
      ON doc.id = item.trade_scope_document_id
     AND doc.executed_at IS NOT NULL
    JOIN public.proposals AS proposal
      ON proposal.id = doc.proposal_id
     AND proposal.commercial_state = 'executed'
    JOIN public.trade_scope_terms AS terms ON terms.proposal_id = proposal.id
    LEFT JOIN public.vendors AS vendor ON vendor.id = item.vendor_id
    WHERE item.project_id = p_project_id
      AND item.removed_at IS NULL
      AND item.design_disposition NOT IN ('not_selected', 'superseded')
    UNION ALL
    SELECT item.id,item.project_room_id,item.ffe_category,item.status,item.external_fulfilment_id,
           item.sort_order,item.created_at,item.name,
           COALESCE(vendor.name,item.vendor_name),vendor.made_in
    FROM public.project_ffe_items item
    JOIN public.project_external_fulfilments f ON f.id=item.external_fulfilment_id AND f.project_id=item.project_id
    LEFT JOIN public.vendors vendor ON vendor.id=item.vendor_id
    WHERE item.project_id=p_project_id AND item.removed_at IS NULL
      AND item.design_disposition NOT IN ('not_selected','superseded')
  ),
  -- A source's plate: the asset its copy request names (00845: also while a
  -- re-crop of that asset is queued, see header).
  plate AS (
    SELECT request.source_kind, request.source_ref, request.asset_id AS id
    FROM public.client_plate_requests AS request
    JOIN public.client_plate_assets AS asset
      ON asset.id = request.asset_id
     AND asset.project_id = request.project_id
    WHERE request.project_id = p_project_id
  ),
  -- Each picture of a shown line that has its plate.
  line_picture AS (
    SELECT picture.id AS picture_id, picture.item_id, picture.is_primary,
           picture.position, picture.created_at, plate.id AS asset_id,
           plate.source_kind
    FROM public.project_ffe_item_images AS picture
    JOIN line ON line.id = picture.item_id
    JOIN plate
      ON plate.source_kind IN ('upload', 'maker')
     AND plate.source_ref = jsonb_build_object(
           'table', 'project_ffe_item_images', 'id', picture.id::text)
    WHERE picture.project_id = p_project_id
  ),
  line_plate AS (
    SELECT DISTINCT ON (line_picture.item_id, line_picture.asset_id)
           line_picture.item_id, line_picture.asset_id, line_picture.is_primary,
           line_picture.position, line_picture.created_at, line_picture.source_kind
    FROM line_picture
    ORDER BY line_picture.item_id, line_picture.asset_id,
             line_picture.is_primary DESC, line_picture.position, line_picture.created_at
  ),
  room AS (
    SELECT project_room.id, project_room.name, project_room.sort_order,
           project_room.created_at, project_room.concept_render_url,
           project_room.concept_render_uploaded_at
    FROM public.project_rooms AS project_room
    WHERE project_room.project_id = p_project_id
  ),
  concept_plate AS (
    SELECT room.id AS room_id, plate.id AS asset_id
    FROM room
    JOIN plate
      ON plate.source_kind = 'concept'
     AND plate.source_ref = jsonb_build_object('table', 'project_rooms', 'id', room.id::text)
    WHERE room.concept_render_url IS NOT NULL
  ),
  scan_plate AS (
    SELECT scan.project_room_id AS room_id, plate.id AS asset_id,
           still.display_order, still.created_at, still.id AS still_id
    FROM public.room_scans AS scan
    JOIN public.room_scan_images AS still ON still.scan_id = scan.id
    JOIN plate
      ON plate.source_kind = 'scan'
     AND plate.source_ref = jsonb_build_object('table', 'room_scan_images', 'id', still.id::text)
    WHERE scan.project_id = p_project_id
      AND scan.project_room_id IN (SELECT room.id FROM room)
  ),
  installed_plate AS (
    SELECT capture.project_room_id AS room_id, plate.id AS asset_id,
           capture.captured_at, capture.id AS capture_id,
           COALESCE(room.name, v_project.name) AS what
    FROM public.field_captures AS capture
    JOIN plate
      ON plate.source_kind = 'installed'
     AND plate.source_ref = jsonb_build_object('table', 'field_captures', 'id', capture.id::text)
    JOIN public.client_plate_requests AS request
      ON request.project_id = p_project_id
     AND request.source_kind = 'installed'
     AND request.source_ref = plate.source_ref
    LEFT JOIN room ON room.id = capture.project_room_id
    WHERE capture.project_id = p_project_id
      AND public.client_plate_source_owned(p_project_id, 'field_captures', capture.id, request.source_url)
  ),
  board AS (
    SELECT project_board.id, project_board.name, project_board.sort_order,
           project_board.created_at, plate.id AS asset_id
    FROM public.project_boards AS project_board
    LEFT JOIN plate
      ON project_board.cover_image_url IS NOT NULL
     AND plate.source_kind = 'board'
     AND plate.source_ref = jsonb_build_object('table', 'project_boards', 'id', project_board.id::text)
    WHERE project_board.project_id = p_project_id
  ),
  sheet AS (
    SELECT plan_sheet.id, plan_sheet.title, plan_sheet.sort_order,
           print.created_at, plate.id AS asset_id
    FROM public.plan_sheets AS plan_sheet
    LEFT JOIN public.plan_prints AS print ON print.id = plan_sheet.current_print_id
    LEFT JOIN plate
      ON plate.source_kind = 'sheet'
     AND plate.source_ref = jsonb_build_object('table', 'plan_prints', 'id', print.id::text)
    WHERE plan_sheet.project_id = p_project_id
      AND plan_sheet.state = 'shared'
  ),
  -- Every plate the envelope names, with what its caption says about it.
  -- Installed attribution wins shared bytes; concept provenance still forbids a hero.
  caption_source AS (
    SELECT installed_plate.asset_id, installed_plate.what, NULL::text AS maker_name,
           installed_plate.captured_at AS taken, 'installed'::text AS kind, 0 AS precedence
    FROM installed_plate
    UNION ALL
    SELECT line_plate.asset_id, line.name_as_signed AS what, line.maker_name,
           line_plate.created_at AS taken, line_plate.source_kind AS kind, 1 AS precedence
    FROM line_plate JOIN line ON line.id = line_plate.item_id
    UNION ALL
    SELECT concept_plate.asset_id, room.name, NULL,
           COALESCE(room.concept_render_uploaded_at, room.created_at), 'concept', 2
    FROM concept_plate JOIN room ON room.id = concept_plate.room_id
    UNION ALL
    SELECT scan_plate.asset_id, room.name, NULL, scan_plate.created_at, 'scan', 3
    FROM scan_plate JOIN room ON room.id = scan_plate.room_id
    UNION ALL
    SELECT board.asset_id, board.name, NULL, board.created_at, 'board', 4
    FROM board WHERE board.asset_id IS NOT NULL
    UNION ALL
    SELECT sheet.asset_id, sheet.title, NULL, sheet.created_at, 'sheet', 5
    FROM sheet WHERE sheet.asset_id IS NOT NULL
  ),
  caption AS (
    SELECT DISTINCT ON (caption_source.asset_id)
           caption_source.asset_id,
           caption_source.kind,
           caption_source.what,
           CASE WHEN v_project.show_makers AND NULLIF(btrim(caption_source.maker_name), '') IS NOT NULL
                THEN btrim(caption_source.maker_name)
                ELSE v_studio_name END AS whose,
           CASE WHEN caption_source.kind = 'installed' THEN 'photographed ' ELSE '' END
             || to_char(caption_source.taken, 'FMDD FMMonth YYYY') AS taken_on
    FROM caption_source
    ORDER BY caption_source.asset_id, caption_source.precedence, caption_source.taken
  )
  SELECT jsonb_build_object(
    'project', jsonb_build_object(
      'id', v_project.id,
      'name', v_project.name,
      'phase', v_project.current_phase,
      'targetDate', COALESCE(v_project.target_end_date, v_project.expected_completion_date),
      'showMakers', v_project.show_makers,
      'studio', jsonb_build_object('name', v_studio_name, 'town', v_studio_town)
    ),
    'rooms', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', room.id,
        'name', room.name,
        'anchor', 'room-' || room.id::text,
        'conceptAssetId', (SELECT concept_plate.asset_id FROM concept_plate
                           WHERE concept_plate.room_id = room.id),
        'scanAssetIds', COALESCE((
          SELECT jsonb_agg(picture.asset_id ORDER BY picture.priority, picture.display_order,
                                                   picture.created_at, picture.source_id)
          FROM (
            SELECT installed_plate.asset_id, 0 AS priority, 0 AS display_order,
                   installed_plate.captured_at AS created_at, installed_plate.capture_id AS source_id
            FROM installed_plate WHERE installed_plate.room_id = room.id
            UNION ALL
            SELECT scan_plate.asset_id, 1, scan_plate.display_order,
                   scan_plate.created_at, scan_plate.still_id
            FROM scan_plate WHERE scan_plate.room_id = room.id
          ) AS picture
        ), '[]'::jsonb),
        'items', COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'id', line.id,
            'responsibility',CASE WHEN line.external_fulfilment_id IS NOT NULL THEN 'external' ELSE 'studio' END,
            'externalFulfilmentId',line.external_fulfilment_id,
            'nameAsSigned', line.name_as_signed,
            'category', line.ffe_category,
            'status', line.status,
            'makerName', CASE WHEN v_project.show_makers THEN line.maker_name END,
            'madeIn', CASE WHEN v_project.show_makers THEN line.made_in END,
            -- No item table carries these four today (00842 header).
            'material', NULL,
            'finish', NULL,
            'dimensions', NULL,
            'descriptionAsSigned', NULL,
            'assetIds', COALESCE((
              SELECT jsonb_agg(line_plate.asset_id
                               ORDER BY line_plate.is_primary DESC, line_plate.position,
                                        line_plate.created_at, line_plate.asset_id)
              FROM line_plate WHERE line_plate.item_id = line.id
            ), '[]'::jsonb),
            'silhouetteKind', line.ffe_category
          ) ORDER BY line.sort_order, line.created_at, line.id)
          FROM line WHERE line.project_room_id = room.id
        ), '[]'::jsonb)
      ) ORDER BY room.sort_order NULLS FIRST, room.created_at, room.id)
      FROM room
    ), '[]'::jsonb),
    'assets', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', asset.id,
        'sha256', asset.sha256,
        'sourceKind', provenance.kind,
        'width', asset.width,
        'height', asset.height,
        'ground', asset.ground,
        'dominantHex', asset.dominant_hex,
        'lqip', asset.lqip,
        'focal', to_jsonb(asset.focal),
        'subjectBox', to_jsonb(asset.subject_box),
        'crops', asset.crops,
        'caption', jsonb_build_object(
          'what', caption.what,
          'whose', caption.whose,
          'when', caption.taken_on
        ),
        'alt', public._client_plate_alt(caption.what, caption.whose, provenance.kind)
      ) ORDER BY (provenance.kind = 'installed') DESC, caption.asset_id)
      FROM caption
      JOIN public.client_plate_assets AS asset
        ON asset.id = caption.asset_id
       AND asset.project_id = p_project_id
      CROSS JOIN LATERAL (
        SELECT CASE
                 WHEN asset.concept_seen
                   OR asset.source_kind = 'concept'
                   OR EXISTS (SELECT 1 FROM plate
                              WHERE plate.id = asset.id AND plate.source_kind = 'concept')
                 THEN 'concept'
                 ELSE caption.kind
               END AS kind
      ) AS provenance
    ), '[]'::jsonb),
    'palette', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'hex', swatch.value ->> 'hex',
        'brand', swatch.value ->> 'brand',
        'name', swatch.value ->> 'name'
      ) ORDER BY swatch.ordinality)
      FROM (
        SELECT palette.swatches
        FROM public.project_palettes AS palette
        WHERE palette.project_id = p_project_id
        ORDER BY palette.is_primary DESC, palette.sort_order, palette.created_at, palette.id
        LIMIT 1
      ) AS chosen
      CROSS JOIN LATERAL jsonb_array_elements(
        CASE WHEN jsonb_typeof(chosen.swatches) = 'array' THEN chosen.swatches ELSE '[]'::jsonb END
      ) WITH ORDINALITY AS swatch(value, ordinality)
      WHERE NULLIF(btrim(swatch.value ->> 'hex'), '') IS NOT NULL
    ), '[]'::jsonb),
    'boards', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', board.id, 'name', board.name, 'assetId', board.asset_id
      ) ORDER BY board.sort_order, board.created_at, board.id)
      FROM board
    ), '[]'::jsonb),
    'sheets', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', sheet.id, 'title', sheet.title, 'assetId', sheet.asset_id
      ) ORDER BY sheet.sort_order, sheet.id)
      FROM sheet
    ), '[]'::jsonb)
  )
  INTO v_result;

  RETURN v_result;
END;
$$;

-- Grafted from 00876_round8_external_presence_parity.sql
CREATE OR REPLACE FUNCTION public.send_commercial_document(
  p_proposal_id uuid,
  p_expected_fingerprint text,
  p_personal_message text DEFAULT NULL,
  p_valid_until timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_proposal public.proposals%ROWTYPE;
  v_scope_project_id uuid;
  v_scope_current_project_id uuid;
  v_current_fingerprint text;
  v_dispatch_id uuid := extensions.gen_random_uuid();
  v_client_email text;
  v_client_name text;
  v_designer_name text;
  v_identity_name text;
  v_identity_logo text;
  v_identity_source text;
  v_sender_name text;
  v_studio_name text;
  v_studio_logo text;
  v_terms public.trade_scope_terms%ROWTYPE;
  v_draw_total bigint;
  v_allocation_total bigint;
  v_allocation_count integer;
  v_section_count integer;
  v_draw_count integer;
  v_gate_count integer;
  v_gate_sort integer;
  v_max_sort integer;
  v_first_gates boolean;
  v_percentage_count integer;
  v_percentage_total numeric;
  -- 00578
  v_pricing_basis jsonb;
  v_draws jsonb;
  v_allowances jsonb;
  v_contract_sum bigint;
  v_message text;
  v_disclosure text;
  v_draw_gross bigint;
  v_previous_send text := current_setting('app.proposal_send_id', true);
  v_previous_dispatch text := current_setting('app.proposal_send_dispatch_link', true);
BEGIN
  -- C2 amendments join the established project-first execution prefix.
  SELECT project.id INTO v_scope_project_id
  FROM public.proposals proposal
  JOIN public.project_commercial_documents doc ON doc.proposal_id=proposal.id
  JOIN public.projects project ON project.id=doc.project_id
  WHERE proposal.id=p_proposal_id AND proposal.document_kind IN ('service_addendum','design_services','design_build')
    AND EXISTS(SELECT 1 FROM public.server_capabilities WHERE key='scope_editions' AND enabled)
  FOR UPDATE OF project;
  SELECT * INTO v_proposal FROM public.proposals
  WHERE id = p_proposal_id FOR UPDATE;
  IF NOT FOUND OR v_proposal.status <> 'draft' OR v_proposal.document_kind = 'legacy'
     OR NOT public._can_author_proposal(v_proposal.designer_id)
  THEN
    RAISE EXCEPTION 'commercial draft % not found or access denied', p_proposal_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_proposal.document_kind = 'furnishings_authorization' THEN
    -- 00876: do not send a stale snapshot of an externally fulfilled line.
    PERFORM item.id FROM public.project_ffe_items AS item
    WHERE EXISTS (
      SELECT 1 FROM public.furnishing_authorization_items AS source
      JOIN public.project_commercial_documents AS document
        ON document.id = source.commercial_document_id
      WHERE document.proposal_id = p_proposal_id
        AND source.source_ffe_item_id = item.id
    ) ORDER BY item.id FOR UPDATE;
    IF EXISTS (
      SELECT 1 FROM public.furnishing_authorization_items AS source
      JOIN public.project_commercial_documents AS document
        ON document.id = source.commercial_document_id
      JOIN public.project_ffe_items AS item ON item.id = source.source_ffe_item_id
      WHERE document.proposal_id = p_proposal_id
        AND item.external_fulfilment_id IS NOT NULL
    ) THEN
      RAISE EXCEPTION 'external_presence_authorization_refused'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  -- Validate the signed C2 input at the last mutable door, independently of save.
  PERFORM public._normalize_scope_package_parts(p_proposal_id, COALESCE((
    SELECT jsonb_agg(jsonb_build_object('kind',kind,'payload',payload) ORDER BY position)
    FROM public.proposal_agreement_parts WHERE proposal_id=p_proposal_id),'[]'));
  PERFORM public._validate_scope_retained_parts(p_proposal_id, COALESCE((
    SELECT jsonb_agg(jsonb_build_object('kind',kind,'payload',payload) ORDER BY position)
    FROM public.proposal_agreement_parts WHERE proposal_id=p_proposal_id),'[]'));
  IF v_proposal.document_kind IN ('service_addendum','design_services','design_build')
     AND EXISTS(SELECT 1 FROM public.server_capabilities WHERE key='scope_editions' AND enabled) THEN
    SELECT doc.project_id INTO v_scope_current_project_id
    FROM public.project_commercial_documents doc WHERE doc.proposal_id=p_proposal_id FOR UPDATE;
    -- 40001 on purpose: the document changed after the project-first read;
    -- PostgREST's retry re-reads both, bounded: each further attempt needs another concurrent commit (RC7-e2-2).
    IF v_scope_current_project_id IS DISTINCT FROM v_scope_project_id THEN
      RAISE EXCEPTION 'scope_execution_document_moved' USING ERRCODE='serialization_failure';
    END IF;
  END IF;
  IF v_scope_project_id IS NOT NULL THEN
    PERFORM public._assert_scope_external_amendment(v_scope_project_id,COALESCE((
      SELECT jsonb_agg(jsonb_build_object('kind',kind,'payload',payload) ORDER BY position)
      FROM public.proposal_agreement_parts WHERE proposal_id=p_proposal_id),'[]'));
  END IF;
  v_current_fingerprint := public._commercial_document_fingerprint(p_proposal_id);
  IF v_current_fingerprint IS DISTINCT FROM p_expected_fingerprint THEN
    RAISE EXCEPTION 'commercial document changed after review; refresh before sending'
      USING ERRCODE = 'PT409';
  END IF;

  IF v_proposal.client_id IS NULL OR v_proposal.designer_client_id IS NULL
     OR NOT EXISTS (
       SELECT 1 FROM public.designer_clients dc
       WHERE dc.id = v_proposal.designer_client_id
         AND dc.designer_id = v_proposal.designer_id
         AND dc.client_id = v_proposal.client_id
     )
  THEN
    RAISE EXCEPTION 'commercial document requires an exact client relationship before sending'
      USING ERRCODE = 'check_violation';
  END IF;
  -- 00575: role rates are required only when the agreement bills time — a
  -- document with no parts (every pre-00575 and every flag-off document)
  -- still owes them, and so does one carrying a rate_card part. A composed
  -- flat-fee or retainer-only agreement owes none.
  IF v_proposal.document_kind IN ('design_services', 'service_addendum') AND (
    NOT EXISTS (SELECT 1 FROM public.proposal_service_terms t WHERE t.proposal_id = p_proposal_id)
    OR (public._agreement_requires_rate_card(p_proposal_id)
        AND NOT EXISTS (SELECT 1 FROM public.proposal_service_rates r WHERE r.proposal_id = p_proposal_id))
  ) THEN
    RAISE EXCEPTION 'design-services send requires terms, and role rates whenever a rate card is present'
      USING ERRCODE = 'check_violation';
  END IF;
  -- 00575: R4's floor is asked at the door too, not only where the parts were
  -- written. A composition can reach 'draft' by more than one road —
  -- materialize_standard_parts seeds from a terms row a co-member may have
  -- edited — so the last gate before the client sees the document asks again.
  IF v_proposal.document_kind IN ('design_services', 'service_addendum')
     AND public._agreement_floor_unmet(p_proposal_id) THEN
    RAISE EXCEPTION 'an agreement that bills time needs a ceiling'
      USING ERRCODE = 'check_violation';
  END IF;
  -- R22: and the fee half of the same floor, in the room's own sentence.
  IF v_proposal.document_kind IN ('design_services', 'service_addendum')
     AND public._agreement_fee_unnamed(p_proposal_id) THEN
    RAISE EXCEPTION 'This agreement names no fee. Add a rate card, a flat fee, or a per-phase fee.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_proposal.document_kind = 'furnishings_authorization' AND NOT EXISTS (
    SELECT 1 FROM public.project_commercial_documents d
    JOIN public.furnishing_authorization_items i ON i.commercial_document_id = d.id
    WHERE d.proposal_id = p_proposal_id
      AND EXISTS (SELECT 1 FROM public.project_budget_checkpoints c
        WHERE c.id = d.budget_checkpoint_id AND c.status IN ('acknowledged', 'overridden'))
  ) THEN
    RAISE EXCEPTION 'furnishings send requires a valid checkpoint and item snapshot'
      USING ERRCODE = 'check_violation';
  END IF;

  -- 00423: the trade arm. A scope is only a document when it says WHO does the
  -- work, WHAT the work is, WHAT it costs, and WHEN the client pays — and when
  -- the last two agree to the cent.
  IF v_proposal.document_kind = 'trade_scope' THEN
    SELECT * INTO v_terms FROM public.trade_scope_terms
    WHERE proposal_id = p_proposal_id;
    IF v_terms.proposal_id IS NULL OR v_terms.party_id IS NULL
       OR COALESCE(v_terms.client_price_cents, 0) <= 0 THEN
      RAISE EXCEPTION 'trade scope send requires a named party and a client price'
        USING ERRCODE = 'check_violation';
    END IF;

    SELECT count(*) INTO v_section_count FROM public.trade_scope_sections
    WHERE proposal_id = p_proposal_id;
    IF v_section_count = 0 THEN
      RAISE EXCEPTION 'trade scope send requires at least one scope section'
        USING ERRCODE = 'check_violation';
    END IF;

    SELECT count(*), COALESCE(sum(amount_cents), 0),
           count(*) FILTER (WHERE gates_on_acceptance),
           max(sort_order),
           max(sort_order) FILTER (WHERE gates_on_acceptance)
    INTO v_draw_count, v_draw_total, v_gate_count, v_max_sort, v_gate_sort
    FROM public.trade_scope_draws WHERE proposal_id = p_proposal_id;
    IF v_draw_count = 0 THEN
      RAISE EXCEPTION 'trade scope send requires at least one draw'
        USING ERRCODE = 'check_violation';
    END IF;
    IF v_draw_total IS DISTINCT FROM v_terms.client_price_cents::bigint THEN
      RAISE EXCEPTION 'trade scope draw schedule must sum to the client price'
        USING ERRCODE = 'check_violation';
    END IF;
    IF v_gate_count <> 1 THEN
      RAISE EXCEPTION 'trade scope draw schedule must have exactly one acceptance-gated draw'
        USING ERRCODE = 'check_violation';
    END IF;
    IF v_gate_sort IS DISTINCT FROM v_max_sort THEN
      RAISE EXCEPTION 'the acceptance-gated draw must be the last draw in the schedule'
        USING ERRCODE = 'check_violation';
    END IF;

    -- The one-gate and gate-is-last rules hold TRIVIALLY on a single-draw
    -- schedule: with one row, min sort_order = max sort_order, so a lone 100%
    -- "Final · on acceptance" draw satisfies every check above. Execution then
    -- bills the lowest-sort draw at signature — which would invoice the client
    -- the whole scope price the moment they sign, on the strength of a document
    -- that says the money is due on acceptance. The first draw is the deposit by
    -- construction, so it is the one draw that cannot gate. Same selector the
    -- execute rail uses (sort_order, id), so the two can never disagree about
    -- which draw is first.
    SELECT w.gates_on_acceptance INTO v_first_gates
    FROM public.trade_scope_draws w
    WHERE w.proposal_id = p_proposal_id
    ORDER BY w.sort_order, w.id LIMIT 1;
    IF COALESCE(v_first_gates, false) THEN
      RAISE EXCEPTION 'the first draw is billed at signature, so it must not be the acceptance-gated one'
        USING ERRCODE = 'check_violation';
    END IF;

    -- Percentage is display and amount_cents is the money, but a display figure
    -- that contradicts the money beside it is a second payment plan on the same
    -- page — and the client's document renders both. So when the studio states
    -- percentages at all, they must total 100 and each must describe its own
    -- amount. The tolerances are the honest ones: half a point for the total (a
    -- 33.3/33.3/33.4 schedule is a real schedule), and a dollar per line for the
    -- rounding an exact-cents split of an odd price forces.
    SELECT count(*) FILTER (WHERE w.percentage IS NOT NULL),
           COALESCE(sum(w.percentage), 0)
    INTO v_percentage_count, v_percentage_total
    FROM public.trade_scope_draws w WHERE w.proposal_id = p_proposal_id;
    IF v_percentage_count > 0 THEN
      IF abs(v_percentage_total - 100) > 0.5 THEN
        RAISE EXCEPTION 'trade scope draw percentages must total 100'
          USING ERRCODE = 'check_violation';
      END IF;
      IF EXISTS (
        SELECT 1 FROM public.trade_scope_draws w
        WHERE w.proposal_id = p_proposal_id AND w.percentage IS NOT NULL
          AND abs(round(v_terms.client_price_cents * w.percentage / 100.0)
                  - w.amount_cents) > 100
      ) THEN
        RAISE EXCEPTION 'each trade scope draw percentage must match the amount beside it'
          USING ERRCODE = 'check_violation';
      END IF;
    END IF;

    -- Allocations are optional as a SET. Once the studio starts apportioning the
    -- price across rooms, the apportionment must be complete and exact — a
    -- half-allocated scope tells the client a room costs $X and leaves the rest
    -- of the money unaccounted for.
    SELECT count(*) FILTER (WHERE allocation_cents IS NOT NULL),
           COALESCE(sum(allocation_cents), 0)
    INTO v_allocation_count, v_allocation_total
    FROM public.trade_scope_sections WHERE proposal_id = p_proposal_id;
    IF v_allocation_count > 0
       AND (v_allocation_count <> v_section_count
            OR v_allocation_total IS DISTINCT FROM v_terms.client_price_cents::bigint) THEN
      RAISE EXCEPTION 'trade scope section allocations must sum to the client price'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  -- ── 00578: the design-build arm (P9, P10, P11, R4, R11) ────────────────
  IF v_proposal.document_kind = 'design_build' THEN
    -- R48 (W3R2-01) — the door asks the same question upsert_agreement_parts
    -- asks, because a part hidden before this refusal existed is still on the
    -- stack. _agreement_design_build_part reads the AUTHORED row, so without
    -- this the arm below validates a price the client's projection has
    -- already dropped and the homeowner signs a paper naming none.
    IF EXISTS (
      SELECT 1 FROM public.proposal_agreement_parts ap
      WHERE ap.proposal_id = p_proposal_id
        AND ap.kind = 'schedule'
        AND ap.variant IN ('pricing_basis', 'draws')
        AND NOT ap.client_visible
    ) THEN
      RAISE EXCEPTION
        'your client signs the price and the draws, so neither can be hidden from her'
        USING ERRCODE = 'check_violation';
    END IF;

    v_pricing_basis := public._agreement_design_build_part(
      p_proposal_id, 'pricing_basis');
    IF v_pricing_basis IS NULL THEN
      RAISE EXCEPTION 'a design-build agreement needs a pricing basis'
        USING ERRCODE = 'check_violation';
    END IF;
    v_message := public._validate_pricing_basis_payload(v_pricing_basis);
    IF v_message IS NOT NULL THEN
      RAISE EXCEPTION '%', v_message USING ERRCODE = 'check_violation';
    END IF;

    -- R48 — and the fee half of R22's floor, asked of this class in its own
    -- words. _agreement_fee_unnamed reads pricing_basis through the same
    -- client_visible filter as every other fee, so this is the second reading
    -- of the same rule: whatever else is true, the paper she signs names a
    -- price she can read.
    IF public._agreement_fee_unnamed(p_proposal_id) THEN
      RAISE EXCEPTION 'this agreement names no price your client can read'
        USING ERRCODE = 'check_violation';
    END IF;

    v_draws := public._agreement_design_build_part(p_proposal_id, 'draws');
    IF v_draws IS NULL THEN
      RAISE EXCEPTION 'a design-build agreement needs a draw schedule'
        USING ERRCODE = 'check_violation';
    END IF;
    v_message := public._validate_draws_payload(v_draws);
    IF v_message IS NOT NULL THEN
      RAISE EXCEPTION '%', v_message USING ERRCODE = 'check_violation';
    END IF;

    v_allowances := public._agreement_design_build_part(
      p_proposal_id, 'allowances');
    IF v_allowances IS NOT NULL THEN
      v_message := public._validate_allowances_payload(
        v_allowances, v_pricing_basis);
      IF v_message IS NOT NULL THEN
        RAISE EXCEPTION '%', v_message USING ERRCODE = 'check_violation';
      END IF;
    END IF;

    v_message := public._validate_no_double_count(
      public._agreement_parts_json(p_proposal_id));
    IF v_message IS NOT NULL THEN
      RAISE EXCEPTION '%', v_message USING ERRCODE = 'check_violation';
    END IF;

    -- One contract, one answer about how the trades are priced to the client
    -- (research 02 §9 item 5). It is authored on the sub-disclosure clause,
    -- where the composer's selector lives; the build sheet also allows it
    -- inside the pricing basis, so both are read and a DISAGREEMENT is
    -- refused rather than silently resolved.
    v_disclosure := public._agreement_sub_disclosure(p_proposal_id);
    IF v_disclosure = 'conflict' THEN
      RAISE EXCEPTION 'this agreement says the trades are priced open-book in one place and closed-book in another'
        USING ERRCODE = 'check_violation';
    END IF;
    IF v_disclosure IS NULL THEN
      RAISE EXCEPTION 'say whether the trades are priced open-book or closed-book'
        USING ERRCODE = 'check_violation';
    END IF;

    -- R43: under closed book the schedule of values is the studio's own, not
    -- derived from the cost lines — so there has to be one. Its arithmetic was
    -- already checked by _validate_pricing_basis_payload above; this is the
    -- door that asks for it at all.
    IF v_disclosure <> 'open_book'
       AND jsonb_array_length(
             public._agreement_schedule_of_values(
               v_pricing_basis, v_disclosure)) = 0 THEN
      RAISE EXCEPTION 'a closed-book agreement needs a schedule of values written for your client'
        USING ERRCODE = 'check_violation';
    END IF;

    -- R10: the gate holds at send too, not only at template selection. An
    -- attestation can lapse between composing and sending.
    IF NOT public.studio_has_live_license_attestation(
             public._agreement_studio_id(p_proposal_id, auth.uid())) THEN
      RAISE EXCEPTION 'the design-build template needs a current licensing attestation on file'
        USING ERRCODE = 'check_violation';
    END IF;

    -- R11: a notice counsel has not enabled never reaches a client's page,
    -- however the attachment part came to name it.
    IF EXISTS (
      SELECT 1
      FROM public.proposal_agreement_parts ap
      JOIN public.agreement_jurisdiction_notices notice
        ON notice.state = NULLIF(btrim(ap.payload->>'jurisdiction'), '')
      WHERE ap.proposal_id = p_proposal_id
        AND ap.kind = 'attachment'
        AND NOT notice.enabled
    ) THEN
      RAISE EXCEPTION 'that jurisdiction notice is held for counsel review and cannot be sent'
        USING ERRCODE = 'check_violation';
    END IF;

    -- R11's other half — AN ATTESTATION OF RECEIPT NEEDS SOMETHING RECEIVED.
    -- An attachment on the homeowner's copy that asks her to tick "I received
    -- this" must carry the words she is attesting she received; the tick is
    -- recorded onto her signature row by `part_key`, and a leaf whose wording
    -- is still with counsel would put an empty document into that record.
    IF EXISTS (
      SELECT 1
      FROM public.proposal_agreement_parts ap
      WHERE ap.proposal_id = p_proposal_id
        AND ap.kind = 'attachment'
        AND ap.client_visible
        AND (ap.payload->'acknowledgeRequired') = 'true'::jsonb
        AND NULLIF(btrim(COALESCE(ap.payload->>'body', '')), '') IS NULL
    ) THEN
      RAISE EXCEPTION 'an attachment your client must confirm she received needs its wording first'
        USING ERRCODE = 'check_violation';
    END IF;

    v_contract_sum := public._agreement_contract_sum_cents(v_pricing_basis);
    SELECT COALESCE(sum(row.gross_cents), 0) INTO v_draw_gross
    FROM public._agreement_draw_rows(v_draws, v_contract_sum) AS row
    WHERE NOT row.is_retainage_release;
    IF v_draw_gross IS DISTINCT FROM v_contract_sum THEN
      RAISE EXCEPTION 'the draw schedule must come to the contract sum, to the cent'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  PERFORM 1 FROM public.proposal_service_terms
  WHERE proposal_id = p_proposal_id FOR UPDATE;
  PERFORM 1 FROM public.proposal_service_rates
  WHERE proposal_id = p_proposal_id ORDER BY id FOR UPDATE;
  PERFORM i.id FROM public.furnishing_authorization_items i
  JOIN public.project_commercial_documents d ON d.id = i.commercial_document_id
  WHERE d.proposal_id = p_proposal_id ORDER BY i.id FOR UPDATE OF i;
  PERFORM 1 FROM public.trade_scope_terms
  WHERE proposal_id = p_proposal_id FOR UPDATE;
  PERFORM 1 FROM public.trade_scope_sections
  WHERE proposal_id = p_proposal_id ORDER BY id FOR UPDATE;
  PERFORM 1 FROM public.trade_scope_draws
  WHERE proposal_id = p_proposal_id ORDER BY id FOR UPDATE;
  IF public._commercial_document_fingerprint(p_proposal_id)
     IS DISTINCT FROM p_expected_fingerprint THEN
    RAISE EXCEPTION 'commercial document changed while sending; refresh before sending'
      USING ERRCODE = 'PT409';
  END IF;

  PERFORM set_config('app.proposal_send_id', p_proposal_id::text, true);
  UPDATE public.proposals SET
    status = 'sent', sent_at = now(),
    total_amount = CASE
      WHEN v_proposal.document_kind = 'trade_scope'
        THEN COALESCE(v_terms.client_price_cents, total_amount)
      -- 00578: the turnkey prime's total IS the contract sum the pricing
      -- basis names, so the send snapshot, the dispatch row and the client's
      -- bundle all report one number.
      WHEN v_proposal.document_kind = 'design_build'
        THEN COALESCE(v_contract_sum, total_amount)
      ELSE total_amount END,
    personal_message = COALESCE(p_personal_message, personal_message),
    valid_until = COALESCE(p_valid_until, valid_until), updated_at = now()
  WHERE id = p_proposal_id RETURNING * INTO v_proposal;
  PERFORM set_config('app.proposal_send_id', COALESCE(v_previous_send, ''), true);

  -- The UPDATE above writes hashed fields — total_amount for a trade scope, and
  -- valid_until / personal_message on every rail — so the fingerprint verified
  -- twice before the write is no longer the hash of the document that just left.
  -- Recompute, so what the caller is handed is what
  -- _commercial_document_fingerprint answers about this document now. (Nothing
  -- after this point touches a hashed column: proposal_send_dispatch_id, status,
  -- sent_at and updated_at are all outside _proposal_review_fingerprint.)
  v_current_fingerprint := public._commercial_document_fingerprint(p_proposal_id);

  -- 00578: the draw ledger, laid out from the now-frozen payload. Machine
  -- state, so it lands AFTER the fingerprint that records the authored
  -- document and changes nothing about it (RC-8). Re-send is impossible —
  -- the send door refuses a non-draft — so a plain INSERT is enough, and the
  -- ledger guard admits it because this body is SECURITY DEFINER owned by
  -- postgres.
  IF v_proposal.document_kind = 'design_build' THEN
    INSERT INTO public.agreement_draw_invoices (
      proposal_id, draw_key, sort_order, label,
      gross_cents, retainage_cents, net_cents, is_retainage_release
    )
    SELECT p_proposal_id, row.draw_key, row.sort_order, row.label,
           row.gross_cents, row.retainage_cents, row.net_cents,
           row.is_retainage_release
    FROM public._agreement_draw_rows(v_draws, v_contract_sum) AS row
    ORDER BY row.sort_order
    ON CONFLICT (proposal_id, draw_key) DO NOTHING;
  END IF;

  SELECT profile.email, profile.full_name INTO v_client_email, v_client_name
  FROM public.profiles profile WHERE profile.id = v_proposal.client_id;
  IF NULLIF(btrim(COALESCE(v_client_email, '')), '') IS NULL THEN
    RAISE EXCEPTION 'commercial document client must have an email before sending'
      USING ERRCODE = 'check_violation';
  END IF;
  SELECT COALESCE(profile.full_name, profile.display_name) INTO v_designer_name
  FROM public.profiles profile WHERE profile.id = v_proposal.designer_id;
  SELECT identity.name, identity.logo_url, identity.source
  INTO v_identity_name, v_identity_logo, v_identity_source
  FROM public.resolve_studio_identity(v_proposal.project_id, v_proposal.designer_id) identity;
  v_designer_name := COALESCE(NULLIF(btrim(v_designer_name), ''),
    NULLIF(btrim(v_identity_name), ''), 'Your designer');
  v_sender_name := COALESCE(NULLIF(btrim(v_identity_name), ''), v_designer_name);
  IF v_identity_source IN ('studio', 'business_name') THEN
    v_studio_name := NULLIF(btrim(v_identity_name), '');
    v_studio_logo := NULLIF(btrim(v_identity_logo), '');
  END IF;

  INSERT INTO public.proposal_send_dispatches (
    id, proposal_id, sent_at, designer_id, client_id, project_id,
    proposal_title, personal_message, valid_until, total_amount,
    recipient_email, recipient_name, designer_name, sender_name,
    studio_name, studio_logo_url, client_portal_path,
    provider_idempotency_key, email_log_id, in_app_log_id
  ) VALUES (
    v_dispatch_id, v_proposal.id, v_proposal.sent_at, v_proposal.designer_id,
    v_proposal.client_id, v_proposal.project_id, v_proposal.title,
    v_proposal.personal_message, v_proposal.valid_until, v_proposal.total_amount,
    v_client_email, v_client_name, v_designer_name, v_sender_name,
    v_studio_name, v_studio_logo, '/proposals/' || v_proposal.id::text,
    'proposal-send/' || v_dispatch_id::text,
    extensions.uuid_generate_v5('eb7b4041-796a-4c77-bd4d-817d2437917f'::uuid,
      'proposal-send/email/' || v_dispatch_id::text),
    extensions.uuid_generate_v5('eb7b4041-796a-4c77-bd4d-817d2437917f'::uuid,
      'proposal-send/in-app/' || v_dispatch_id::text)
  );
  PERFORM set_config('app.proposal_send_dispatch_link',
    v_proposal.id::text || ':' || v_dispatch_id::text, true);
  UPDATE public.proposals SET proposal_send_dispatch_id = v_dispatch_id
  WHERE id = v_proposal.id AND proposal_send_dispatch_id IS NULL
  RETURNING * INTO v_proposal;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'commercial document send dispatch link already exists'
      USING ERRCODE = 'check_violation';
  END IF;
  PERFORM set_config('app.proposal_send_dispatch_link', COALESCE(v_previous_dispatch, ''), true);

  RETURN jsonb_build_object(
    'proposalId', v_proposal.id,
    'documentKind', v_proposal.document_kind,
    'commercialState', 'sent',
    'status', v_proposal.status,
    'sentAt', v_proposal.sent_at,
    'proposalSendDispatchId', v_proposal.proposal_send_dispatch_id,
    'proposal_send_dispatch_id', v_proposal.proposal_send_dispatch_id,
    'updatedAt', v_proposal.updated_at,
    'documentFingerprint', v_current_fingerprint
  );
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('app.proposal_send_id', COALESCE(v_previous_send, ''), true);
  PERFORM set_config('app.proposal_send_dispatch_link', COALESCE(v_previous_dispatch, ''), true);
  RAISE;
END;
$$;

-- Grafted from 00869_round8_scope_execution.sql
CREATE OR REPLACE FUNCTION public._mint_scope_edition(p_document_id uuid, p_predecessor_id uuid DEFAULT NULL, p_reconciled boolean DEFAULT false)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  doc public.project_commercial_documents%ROWTYPE; proposal public.proposals%ROWTYPE;
  predecessor public.project_scope_editions%ROWTYPE; client_signature public.commercial_document_signatures%ROWTYPE;
  studio_signature public.commercial_document_signatures%ROWTYPE;
  v_edition_id uuid := extensions.gen_random_uuid(); v_edition_number integer; parts jsonb;
  packages jsonb; phases jsonb; policy jsonb; content jsonb; seq bigint;
  previous_marker text := current_setting('app.scope_edition_id',true);
BEGIN
  PERFORM public._assert_scope_composition_enabled();
  SELECT * INTO STRICT doc FROM public.project_commercial_documents WHERE id = p_document_id;
  PERFORM 1 FROM public.projects WHERE id = doc.project_id FOR UPDATE;
  SELECT * INTO STRICT proposal FROM public.proposals WHERE id = doc.proposal_id FOR UPDATE;
  IF NOT public.can_author_scope_proposal(proposal.id) OR NOT public.can_compose_project_plan(doc.project_id)
     OR (proposal.studio_id IS NOT NULL AND proposal.studio_id IS DISTINCT FROM
         (SELECT studio_id FROM public.projects WHERE id = doc.project_id)) THEN
    RAISE EXCEPTION 'scope_edition_tenant_mismatch' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO doc FROM public.project_commercial_documents
  WHERE id=p_document_id AND project_id=doc.project_id AND proposal_id=proposal.id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'scope_execution_document_moved' USING ERRCODE = 'serialization_failure'; END IF;
  SELECT id INTO v_edition_id FROM public.project_scope_editions WHERE commercial_document_id = doc.id;
  IF FOUND THEN RETURN v_edition_id; END IF;
  v_edition_id := extensions.gen_random_uuid();
  SELECT execution_seq INTO seq FROM public.project_commercial_execution_order
  WHERE project_id = doc.project_id AND commercial_document_id = doc.id;
  IF seq IS NULL THEN RAISE EXCEPTION 'scope_execution_order_missing' USING ERRCODE = 'check_violation'; END IF;
  IF doc.document_kind NOT IN ('design_services','design_build','service_addendum')
     OR proposal.commercial_state <> 'executed' OR doc.executed_at IS NULL
     OR proposal.document_kind IS DISTINCT FROM doc.document_kind
     OR (proposal.project_id IS NOT NULL AND proposal.project_id <> doc.project_id) THEN
    RAISE EXCEPTION 'scope_execution_document_invalid' USING ERRCODE = 'check_violation';
  END IF;
  SELECT * INTO predecessor FROM public.project_scope_editions
  WHERE project_id = doc.project_id AND ((p_predecessor_id IS NULL AND status = 'active') OR id = p_predecessor_id)
  FOR UPDATE;
  IF NOT doc.is_origin AND (predecessor.id IS NULL OR predecessor.status NOT IN ('active','stale')
     OR (NOT p_reconciled AND (predecessor.status <> 'active'
        OR proposal.drafted_against_scope_edition_id IS DISTINCT FROM predecessor.id))) THEN
    RAISE EXCEPTION 'scope_edition_stale' USING ERRCODE = 'serialization_failure';
  END IF;
  IF doc.is_origin AND EXISTS (SELECT 1 FROM public.project_scope_editions WHERE project_id = doc.project_id) THEN
    RAISE EXCEPTION 'scope_edition_origin_exists' USING ERRCODE = 'check_violation';
  END IF;
  SELECT * INTO client_signature FROM public.commercial_document_signatures WHERE proposal_id = proposal.id AND party_role = 'client';
  SELECT * INTO studio_signature FROM public.commercial_document_signatures WHERE proposal_id = proposal.id AND party_role = 'studio';
  IF client_signature.id IS NULL OR studio_signature.id IS NULL
     OR client_signature.signer_user_id IS DISTINCT FROM proposal.client_id
     OR client_signature.evidence_fingerprint IS DISTINCT FROM public._commercial_document_fingerprint(proposal.id)
     OR studio_signature.evidence_fingerprint IS DISTINCT FROM client_signature.evidence_fingerprint THEN
    RAISE EXCEPTION 'scope_edition_signature_invalid' USING ERRCODE = 'check_violation';
  END IF;
  SELECT COALESCE(jsonb_agg(jsonb_build_object('kind',kind,'payload',payload) ORDER BY position),'[]') INTO parts
  FROM public.proposal_agreement_parts WHERE proposal_id = proposal.id;
  PERFORM public._normalize_scope_package_parts(proposal.id,parts);
  IF EXISTS (SELECT 1 FROM public.project_scope_edition_packages old WHERE old.edition_id = predecessor.id
    AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(parts) p WHERE p->>'kind' = 'scope_package'
      AND p->'payload'->>'packageKey' = old.package_key)) THEN
    RAISE EXCEPTION 'scope_edition_package_dropped' USING ERRCODE = 'check_violation';
  END IF;
  IF NOT doc.is_origin THEN
    PERFORM public._assert_scope_external_amendment(doc.project_id,parts);
  END IF;
  v_edition_number := COALESCE(predecessor.edition_number,0) + 1;
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'package_key',p->>'packageKey','label',p->>'label','room_ids',COALESCE(p->'roomIds','[]'),
    'inclusion',p->>'inclusion','condition_text',p->>'conditionText','responsibilities',p->'responsibilities',
    'provenance',COALESCE(p->'provenance','{}'),'override_of',p->>'overrideOf',
    'design_owed_since',CASE WHEN p->>'inclusion'='included' AND p->'responsibilities'->>'design'='studio'
       THEN COALESCE(old.design_owed_since,v_edition_number) END,
    'installation_owed_since',CASE WHEN p->>'inclusion'='included' AND p->'responsibilities'->>'installation'='studio'
       THEN COALESCE(old.installation_owed_since,v_edition_number) END) ORDER BY p->>'packageKey'),'[]') INTO packages
  FROM (SELECT value->'payload' p FROM jsonb_array_elements(parts) WHERE value->>'kind'='scope_package') new
  LEFT JOIN public.project_scope_edition_packages old ON old.edition_id=predecessor.id AND old.package_key=p->>'packageKey';
  IF doc.is_origin AND EXISTS (
    SELECT 1 FROM public.proposal_phases pp WHERE pp.proposal_id=proposal.id AND
      (SELECT count(*) FROM public.project_phases jp WHERE jp.project_id=doc.project_id AND jp.source_proposal_phase_id=pp.id) <> 1
  ) THEN RAISE EXCEPTION 'scope_edition_phase_unbound' USING ERRCODE = 'check_violation'; END IF;
  SELECT COALESCE(jsonb_agg(to_jsonb(binding) ORDER BY source_proposal_phase_id),'[]') INTO phases FROM (
    SELECT source_proposal_phase_id, project_phase_id,package_key,service_slot,bound_in_edition
    FROM public.project_scope_edition_phases WHERE edition_id=predecessor.id
    UNION ALL
    SELECT pp.id, CASE WHEN doc.is_origin THEN jp.id END, b.package_key,b.service_slot,
      CASE WHEN b.package_key IS NOT NULL THEN v_edition_number END
    FROM public.proposal_phases pp
    LEFT JOIN public.project_phases jp ON doc.is_origin AND jp.project_id=doc.project_id AND jp.source_proposal_phase_id=pp.id
    LEFT JOIN (
      SELECT p->'payload'->>'packageKey' package_key, s.key service_slot, phase.value::text::uuid phase_id
      FROM jsonb_array_elements(parts) p
      CROSS JOIN LATERAL jsonb_each(COALESCE(p->'payload'->'serviceBindings','{}')) s
      CROSS JOIN LATERAL jsonb_array_elements_text(s.value) phase
      WHERE p->>'kind'='scope_package'
    ) b ON b.phase_id=pp.id WHERE pp.proposal_id=proposal.id
  ) binding;
  SELECT p->'payload' INTO policy FROM jsonb_array_elements(parts) p WHERE p->>'kind'='acceptance_signer_policy';
  content := jsonb_build_object('packagesRecorded',EXISTS(SELECT 1 FROM jsonb_array_elements(parts) p WHERE p->>'kind'='scope_package'),
    'packages',packages,'phases',phases,'signerPolicy',policy,'reconciled',p_reconciled);
  PERFORM set_config('app.scope_edition_id',COALESCE(predecessor.id::text,''),true);
  -- One statement lets the immediate self-FK see the new successor while the
  -- one-active index sees the predecessor retired before the INSERT.
  WITH retired AS (
    UPDATE public.project_scope_editions SET status='superseded',superseded_at=studio_signature.signed_at,
      superseded_by_edition_id=v_edition_id WHERE id=predecessor.id RETURNING id
  )
  INSERT INTO public.project_scope_editions(id,project_id,edition_number,kind,commercial_document_id,source_proposal_id,
    predecessor_edition_id,agreement_fingerprint,effective_at,content,content_hash,status)
  SELECT v_edition_id,doc.project_id,v_edition_number,CASE WHEN doc.is_origin THEN 'baseline' ELSE 'amendment' END,
    doc.id,proposal.id,predecessor.id,client_signature.evidence_fingerprint,studio_signature.signed_at,
    content,encode(extensions.digest(convert_to(content::text,'UTF8'),'sha256'),'hex'),'active'
  FROM (SELECT count(*) FROM retired) dependency;
  PERFORM set_config('app.scope_edition_id',COALESCE(previous_marker,''),true);
  INSERT INTO public.project_scope_edition_packages
    (edition_id,package_key,label,room_ids,inclusion,condition_text,responsibilities,provenance,override_of,design_owed_since,installation_owed_since)
  SELECT v_edition_id,p.* FROM jsonb_to_recordset(packages) AS p(package_key text,label text,room_ids uuid[],inclusion text,
    condition_text text,responsibilities jsonb,provenance jsonb,override_of text,design_owed_since integer,installation_owed_since integer);
  INSERT INTO public.project_scope_edition_phases(edition_id,source_proposal_phase_id,project_phase_id,package_key,service_slot,bound_in_edition)
  SELECT v_edition_id,p.* FROM jsonb_to_recordset(phases) AS p(source_proposal_phase_id uuid,project_phase_id uuid,package_key text,service_slot text,bound_in_edition integer);
  INSERT INTO public.project_scope_edition_signers(edition_id,slot,required,profile_id,household_person_id,policy_revision)
  SELECT v_edition_id,s->>'slot',(s->>'required')::boolean,(s->>'profileId')::uuid,(s->>'householdPersonId')::uuid,(policy->>'policyRevision')::integer
  FROM jsonb_array_elements(COALESCE(policy->'signers','[]')) s;
  RETURN v_edition_id;
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('app.scope_edition_id',COALESCE(previous_marker,''),true); RAISE;
END;
$$;

-- Grafted from 00834; external work has no studio ordering checklist.
CREATE OR REPLACE FUNCTION public.get_project_ffe_readiness(p_ffe_item_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_item public.project_ffe_items%ROWTYPE;
  v_spec public.project_ffe_specs%ROWTYPE;
  v_rules jsonb := '[]'::jsonb;
  v_rule text;
  v_missing text[] := '{}';
BEGIN
  SELECT * INTO v_item FROM public.project_ffe_items WHERE id = p_ffe_item_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'selection not found' USING ERRCODE = 'no_data_found';
  END IF;
  PERFORM public._ffe_require_studio_project(v_item.project_id);
  IF v_item.external_fulfilment_id IS NOT NULL THEN
    RETURN jsonb_build_object('selectionId',v_item.id,'responsibility','external',
      'ready',false,'missingFields','[]'::jsonb);
  END IF;
  SELECT * INTO v_spec FROM public.project_ffe_specs WHERE ffe_item_id = v_item.id;
  SELECT COALESCE(template.required_field_rules->'fixed', '[]'::jsonb)
  INTO v_rules
  FROM public.spec_books book
  JOIN public.spec_book_templates template ON template.id = book.template_id
  WHERE book.project_id = v_item.project_id
  ORDER BY book.created_at
  LIMIT 1;

  FOR v_rule IN SELECT jsonb_array_elements_text(COALESCE(v_rules, '[]'::jsonb)) LOOP
    IF (v_rule = 'name' AND btrim(COALESCE(v_item.name, '')) = '')
       OR (v_rule = 'documentCode' AND btrim(COALESCE(v_item.doc_code, '')) = '')
       OR (v_rule = 'room' AND v_item.assignment_scope = 'unassigned')
       OR (v_rule = 'quantity' AND COALESCE(v_item.quantity, 0) <= 0)
       OR (v_rule = 'image' AND COALESCE(
         NULLIF(btrim(CASE
           WHEN jsonb_typeof(v_spec.selected_media->0) = 'string'
             THEN v_spec.selected_media->>0
           WHEN jsonb_typeof(v_spec.selected_media->0->'url') = 'string'
             THEN v_spec.selected_media->0->>'url'
         END), ''),
         NULLIF(btrim(public.primary_image_url(v_item)), ''),
         (SELECT NULLIF(btrim(product.images[1]), '')
          FROM public.products product WHERE product.id = v_item.product_id)
       ) IS NULL)
       OR (v_rule = 'selection' AND v_item.product_id IS NULL)
    THEN
      v_missing := array_append(v_missing, v_rule);
    END IF;
  END LOOP;

  IF v_item.design_disposition <> 'selected' THEN
    v_missing := array_append(v_missing, 'designDisposition');
  END IF;
  IF v_item.removed_at IS NOT NULL THEN
    v_missing := array_append(v_missing, 'removed');
  END IF;
  IF v_item.blocked THEN
    v_missing := array_append(v_missing, 'releaseBlock');
  END IF;
  IF v_item.vendor_id IS NULL THEN
    v_missing := array_append(v_missing, 'vendor');
  END IF;
  IF COALESCE(v_item.quantity, 0) <= 0 THEN
    v_missing := array_append(v_missing, 'quantity');
  END IF;
  IF v_item.item_type = 'fixed' AND (
    COALESCE(v_item.unit_price_cents, 0) <= 0
    OR v_item.line_total_cents IS NULL
    OR v_item.line_total_cents <> v_item.quantity * v_item.unit_price_cents
  ) THEN
    v_missing := array_append(v_missing, 'clientPrice');
  ELSIF v_item.item_type = 'allowance' AND COALESCE(v_item.budget_max_cents, 0) <= 0 THEN
    v_missing := array_append(v_missing, 'allowanceCeiling');
  ELSIF v_item.item_type NOT IN ('fixed', 'allowance') THEN
    v_missing := array_append(v_missing, 'itemType');
  END IF;
  -- 00733 (D5): labor is ready only when its piece is.
  IF v_item.line_kind = 'labor' AND (
    v_item.parent_ffe_item_id IS NULL
    OR NOT COALESCE((public.get_project_ffe_readiness(v_item.parent_ffe_item_id)->>'ready')::boolean, false)
  ) THEN
    v_missing := array_append(v_missing, 'parent_not_ready');
  END IF;

  SELECT COALESCE(array_agg(DISTINCT missing ORDER BY missing), '{}')
  INTO v_missing
  FROM unnest(v_missing) AS missing;

  RETURN jsonb_build_object(
    'selectionId', v_item.id,
    'ready', cardinality(v_missing) = 0,
    'missingFields', to_jsonb(v_missing)
  );
END;
$$;

-- Grafted from 00847; only metadata already frozen in facts is exposed.
CREATE OR REPLACE FUNCTION public.get_client_project_edition(p_project_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_project public.projects%ROWTYPE;
  v_edition public.client_editions%ROWTYPE;
  v_facts jsonb;
  v_composition jsonb;
  v_overrides jsonb;
  v_show_makers boolean;
  v_studio_name text;
  v_maker_pattern text;
  v_extra_hero text;
  v_extra_fact jsonb;
  v_hero text;
  v_assets jsonb;
BEGIN
  -- 00842's guard, verbatim.
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO v_project FROM public.projects WHERE id = p_project_id;
  IF NOT FOUND OR NOT COALESCE(
    v_project.client_id = v_actor
    OR public.can_buy_for_project(v_project.id),
    false
  ) THEN
    RAISE EXCEPTION 'project not found or not accessible'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_edition
  FROM public.client_editions
  WHERE project_id = p_project_id AND status = 'approved';
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  v_facts := CASE WHEN jsonb_typeof(v_edition.facts) = 'object' THEN v_edition.facts ELSE '{}'::jsonb END;
  v_composition := CASE WHEN jsonb_typeof(v_edition.composition) = 'object'
                        THEN v_edition.composition ELSE '{}'::jsonb END;
  v_overrides := COALESCE(v_edition.overrides, '{}'::jsonb);
  v_show_makers := COALESCE(v_project.show_makers, false);
  v_studio_name := v_facts -> 'project' -> 'studio' ->> 'name';

  -- Makers off: the names no plate's words may carry (header), as one
  -- case-insensitive alternation of literals, longest first, so one pattern
  -- both finds and removes them. NULL while makers show, so nothing below
  -- masks anything then.
  IF NOT v_show_makers THEN
    SELECT string_agg(regexp_replace(maker.name, '([.^$|?*+()\[\]{}\\])', '\\\1', 'g'), '|'
                      ORDER BY char_length(maker.name) DESC, maker.name)
    INTO v_maker_pattern
    FROM (
      SELECT DISTINCT lower(source.name) AS name
      FROM (
        SELECT btrim(vendor.name) AS name
        FROM public.project_ffe_items AS item
        JOIN public.vendors AS vendor ON vendor.id = item.vendor_id
        WHERE item.project_id = p_project_id
        UNION ALL
        SELECT btrim(item.vendor_name)
        FROM public.project_ffe_items AS item
        WHERE item.project_id = p_project_id
        UNION ALL
        SELECT btrim(item.value ->> 'makerName')
        FROM jsonb_array_elements(
               CASE WHEN jsonb_typeof(v_facts -> 'rooms') = 'array' THEN v_facts -> 'rooms' ELSE '[]'::jsonb END
             ) AS room
        CROSS JOIN LATERAL jsonb_array_elements(
               CASE WHEN jsonb_typeof(room.value -> 'items') = 'array' THEN room.value -> 'items' ELSE '[]'::jsonb END
             ) AS item
      ) AS source
      WHERE char_length(source.name) >= 3
    ) AS maker;
  END IF;

  -- An override hero the edition does not name (header).
  v_extra_hero := lower(NULLIF(btrim(v_overrides ->> 'heroAssetId'), ''));
  IF v_extra_hero IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM jsonb_array_elements(
         CASE WHEN jsonb_typeof(v_facts -> 'assets') = 'array' THEN v_facts -> 'assets' ELSE '[]'::jsonb END
       ) AS entry
       WHERE lower(entry.value ->> 'id') = v_extra_hero)
     AND NOT EXISTS (
       SELECT 1 FROM public.client_edition_images AS image
       WHERE image.edition_id = v_edition.id AND image.asset_id::text = v_extra_hero) THEN
    SELECT COALESCE(
             (SELECT entry.value
              FROM jsonb_array_elements(
                COALESCE(public._build_project_editorial(p_project_id) -> 'assets', '[]'::jsonb)) AS entry
              WHERE entry.value ->> 'id' = v_extra_hero
              LIMIT 1),
             jsonb_build_object(
               'caption', jsonb_build_object('what', NULL, 'whose', v_studio_name, 'when', NULL),
               'alt', public._client_plate_alt(NULL, v_studio_name, asset.source_kind)))
    INTO v_extra_fact
    FROM public.client_plate_assets AS asset
    WHERE asset.id::text = v_extra_hero
      AND asset.project_id = p_project_id
      AND NOT asset.concept_seen
      AND asset.source_kind <> 'concept';
  END IF;

  -- The plates: every asset the facts or the edition name that is still a
  -- plate of this project, live bytes facts, frozen words, overrides last.
  WITH named AS (
    SELECT lower(entry.value ->> 'id') AS asset_id, entry.value AS fact, entry.ordinality AS position
    FROM jsonb_array_elements(
      CASE WHEN jsonb_typeof(v_facts -> 'assets') = 'array' THEN v_facts -> 'assets' ELSE '[]'::jsonb END
    ) WITH ORDINALITY AS entry(value, ordinality)
    UNION ALL
    SELECT image.asset_id::text, NULL::jsonb, NULL::bigint
    FROM public.client_edition_images AS image
    WHERE image.edition_id = v_edition.id
    UNION ALL
    SELECT v_extra_hero, v_extra_fact, NULL::bigint
    WHERE v_extra_fact IS NOT NULL
  ),
  plate AS (
    SELECT DISTINCT ON (asset.id)
           asset.*,
           named.fact,
           min(named.position) OVER (PARTITION BY asset.id) AS position
    FROM named
    JOIN public.client_plate_assets AS asset
      ON asset.id::text = named.asset_id
     AND asset.project_id = p_project_id
    ORDER BY asset.id, named.fact IS NULL, named.position
  ),
  worded AS (
    SELECT plate.*,
           -- The attribution kind; list_client_editions' attributionKind is
           -- this expression over the same first facts entry.
           CASE WHEN plate.concept_seen OR plate.source_kind = 'concept' THEN 'concept'
                ELSE COALESCE(plate.fact ->> 'sourceKind', plate.source_kind) END AS kind,
           COALESCE(first_image.caption_what, plate.fact -> 'caption' ->> 'what') AS stored_what,
           COALESCE(first_image.alt, plate.fact ->> 'alt') AS stored_alt,
           first_image.caption_whose,
           COALESCE(
             v_overrides -> 'captions' -> plate.id::text ->> 'when',
             first_image.caption_when,
             plate.fact -> 'caption' ->> 'when') AS stored_when,
           v_overrides -> 'captions' -> plate.id::text AS caption_override
    FROM plate
    LEFT JOIN LATERAL (
      SELECT image.alt, image.caption_what, image.caption_whose, image.caption_when
      FROM public.client_edition_images AS image
      WHERE image.edition_id = v_edition.id AND image.asset_id = plate.id
      ORDER BY image.rank NULLS LAST, image.id
      LIMIT 1
    ) AS first_image ON true
  ),
  -- Which words name a maker of this job (never while makers show), and the
  -- what with each such name taken out.
  checked AS (
    SELECT worded.*,
           COALESCE(worded.stored_what ~* v_maker_pattern, false) AS what_names_maker,
           COALESCE((worded.caption_override ->> 'whose') ~* v_maker_pattern, false) AS whose_names_maker,
           COALESCE(worded.stored_alt ~* v_maker_pattern, false) AS alt_names_maker,
           COALESCE(worded.stored_when ~* v_maker_pattern, false) AS when_names_maker,
           -- 00847 (SQ-1687 C2): en dashes and slashes trim too, and a what
           -- left with no letter or digit is empty (the category, else the kind).
           NULLIF(regexp_replace(regexp_replace(regexp_replace(
             regexp_replace(worded.stored_what, v_maker_pattern, '', 'gi'),
             '\s{2,}', ' ', 'g'), '^[\s·–—,:/-]+|[\s·–—,:/-]+$', '', 'g'),
             '^[^[:alnum:]]*$', ''), '') AS bare_what
    FROM worded
  ),
  shown AS (
    SELECT checked.*,
           -- Makers off: a what naming a maker keeps what is left of it (a
           -- name the removal re-formed falls through too); emptied, it is
           -- the category of the line the plate pictures, else the kind
           -- words (story seq 59), so the plate keeps its caption.
           CASE WHEN NOT checked.what_names_maker THEN checked.stored_what
                ELSE COALESCE(
                       CASE WHEN NOT COALESCE(checked.bare_what ~* v_maker_pattern, false)
                            THEN checked.bare_what END,
                       (SELECT btrim(item.value ->> 'category')
                        FROM jsonb_array_elements(
                               CASE WHEN jsonb_typeof(v_facts -> 'rooms') = 'array'
                                    THEN v_facts -> 'rooms' ELSE '[]'::jsonb END
                             ) WITH ORDINALITY AS room(value, ordinality)
                        CROSS JOIN LATERAL jsonb_array_elements(
                               CASE WHEN jsonb_typeof(room.value -> 'items') = 'array'
                                    THEN room.value -> 'items' ELSE '[]'::jsonb END
                             ) WITH ORDINALITY AS item(value, ordinality)
                        WHERE item.value -> 'assetIds' ? checked.id::text
                          AND lower(btrim(item.value ->> 'category')) NOT IN ('', 'uncategorized')
                          AND NOT COALESCE((item.value ->> 'category') ~* v_maker_pattern, false)
                        ORDER BY room.ordinality, item.ordinality
                        LIMIT 1),
                       public._client_plate_alt(NULL, NULL, checked.kind)) END AS shown_what,
           -- Makers off: an item picture is the studio's, an override
           -- notwithstanding (seq 48); other plates keep an override that
           -- names no maker (seq 53).
           CASE WHEN NOT v_show_makers
                     AND (checked.kind IN ('maker', 'upload') OR checked.whose_names_maker)
                THEN v_studio_name
                ELSE COALESCE(
                       checked.caption_override ->> 'whose',
                       CASE WHEN v_show_makers
                            THEN COALESCE(checked.caption_whose, checked.fact -> 'caption' ->> 'whose')
                            ELSE v_studio_name END) END AS shown_whose,
           -- Makers off: a when naming a maker is the facts' date, else none.
           CASE WHEN NOT checked.when_names_maker THEN checked.stored_when
                WHEN NOT COALESCE((checked.fact -> 'caption' ->> 'when') ~* v_maker_pattern, false)
                THEN checked.fact -> 'caption' ->> 'when' END AS shown_when
    FROM checked
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', shown.id,
           'sha256', shown.sha256,
           'sourceKind', shown.kind,
           'width', shown.width,
           'height', shown.height,
           'ground', shown.ground,
           'dominantHex', shown.dominant_hex,
           'lqip', shown.lqip,
           'focal', to_jsonb(shown.focal),
           'subjectBox', to_jsonb(shown.subject_box),
           'crops', shown.crops,
           'caption', jsonb_build_object(
             'what', shown.shown_what, 'whose', shown.shown_whose, 'when', shown.shown_when),
           -- Makers off: an item picture's alt may name its maker, whatever
           -- the edition froze, and any alt naming one is rebuilt too; both
           -- from the caption shown (a what that is only the kind words is
           -- left out, the alt ends on them anyway).
           -- Trusted words (story seq 59 R1): the studio's own name
           -- (resolve_studio_identity's, as the facts froze it) and
           -- _client_plate_alt's fixed kind wording are not maker text. This
           -- rebuilt alt, like the studio's whose above, is final: never
           -- re-masked and never nulled, even when a maker's name sits
           -- inside those words (vendor Nord, studio Nord Studio; vendor
           -- Studio, "studio photograph").
           'alt', CASE WHEN NOT v_show_makers
                            AND (shown.kind IN ('maker', 'upload') OR shown.alt_names_maker)
                       THEN public._client_plate_alt(
                              NULLIF(shown.shown_what, public._client_plate_alt(NULL, NULL, shown.kind)),
                              shown.shown_whose, shown.kind)
                       ELSE shown.stored_alt END
         ) ORDER BY shown.position NULLS LAST, shown.id), '[]'::jsonb)
  INTO v_assets
  FROM shown;

  -- The hero: an override first; never a concept, never a stranger's plate,
  -- never a flagged picture.
  v_hero := lower(NULLIF(btrim(COALESCE(
    v_overrides ->> 'heroAssetId', v_composition -> 'hero' ->> 'assetId')), ''));
  IF v_hero IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(v_assets) AS asset
    JOIN public.client_plate_assets AS plate ON plate.id::text = asset.value ->> 'id'
    WHERE asset.value ->> 'id' = v_hero
      AND asset.value ->> 'sourceKind' <> 'concept'
      AND NOT (plate.flags && ARRAY['people', 'watermark', 'text_overlay']::text[])
  ) THEN
    v_hero := NULL;
  END IF;

  RETURN jsonb_build_object(
    'project', jsonb_build_object(
      'id', v_project.id,
      'name', v_facts -> 'project' -> 'name',
      'phase', v_facts -> 'project' -> 'phase',
      'targetDate', v_facts -> 'project' -> 'targetDate',
      'showMakers', v_show_makers,
      'studio', jsonb_build_object(
        'name', v_facts -> 'project' -> 'studio' -> 'name',
        'town', v_facts -> 'project' -> 'studio' -> 'town')
    ),
    'rooms', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', room.value -> 'id',
        'name', room.value -> 'name',
        'anchor', room.value -> 'anchor',
        'conceptAssetId', room.value -> 'conceptAssetId',
        'scanAssetIds', COALESCE(room.value -> 'scanAssetIds', '[]'::jsonb),
        'items', COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'id', item.value -> 'id',
            'nameAsSigned', item.value -> 'nameAsSigned',
            'category', item.value -> 'category',
            'status', item.value -> 'status',
            'makerName', CASE WHEN v_show_makers THEN item.value -> 'makerName' END,
            'madeIn', CASE WHEN v_show_makers THEN item.value -> 'madeIn' END,
            'material', item.value -> 'material',
            'finish', item.value -> 'finish',
            'dimensions', item.value -> 'dimensions',
            'descriptionAsSigned', to_jsonb(left(item.value ->> 'descriptionAsSigned', 280)),
            'assetIds', COALESCE(item.value -> 'assetIds', '[]'::jsonb),
            'silhouetteKind', item.value -> 'silhouetteKind'
          ) || CASE WHEN item.value ? 'responsibility' THEN jsonb_build_object(
            'responsibility',item.value -> 'responsibility',
            'externalFulfilmentId',item.value -> 'externalFulfilmentId'
          ) ELSE '{}'::jsonb END ORDER BY item.ordinality)
          FROM jsonb_array_elements(
            CASE WHEN jsonb_typeof(room.value -> 'items') = 'array' THEN room.value -> 'items' ELSE '[]'::jsonb END
          ) WITH ORDINALITY AS item(value, ordinality)
        ), '[]'::jsonb)
      ) ORDER BY room.ordinality)
      FROM jsonb_array_elements(
        CASE WHEN jsonb_typeof(v_facts -> 'rooms') = 'array' THEN v_facts -> 'rooms' ELSE '[]'::jsonb END
      ) WITH ORDINALITY AS room(value, ordinality)
    ), '[]'::jsonb),
    'assets', v_assets,
    'palette', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'hex', swatch.value -> 'hex', 'brand', swatch.value -> 'brand', 'name', swatch.value -> 'name'
      ) ORDER BY swatch.ordinality)
      FROM jsonb_array_elements(
        CASE WHEN jsonb_typeof(v_facts -> 'palette') = 'array' THEN v_facts -> 'palette' ELSE '[]'::jsonb END
      ) WITH ORDINALITY AS swatch(value, ordinality)
    ), '[]'::jsonb),
    'boards', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', board.value -> 'id', 'name', board.value -> 'name', 'assetId', board.value -> 'assetId'
      ) ORDER BY board.ordinality)
      FROM jsonb_array_elements(
        CASE WHEN jsonb_typeof(v_facts -> 'boards') = 'array' THEN v_facts -> 'boards' ELSE '[]'::jsonb END
      ) WITH ORDINALITY AS board(value, ordinality)
    ), '[]'::jsonb),
    'sheets', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', sheet.value -> 'id', 'title', sheet.value -> 'title', 'assetId', sheet.value -> 'assetId'
      ) ORDER BY sheet.ordinality)
      FROM jsonb_array_elements(
        CASE WHEN jsonb_typeof(v_facts -> 'sheets') = 'array' THEN v_facts -> 'sheets' ELSE '[]'::jsonb END
      ) WITH ORDINALITY AS sheet(value, ordinality)
    ), '[]'::jsonb),
    'composition', jsonb_build_object(
      'voice', v_composition -> 'voice',
      'hero', CASE WHEN v_hero IS NULL THEN 'null'::jsonb
                   ELSE jsonb_build_object('assetId', v_hero) END,
      'held', CASE WHEN jsonb_typeof(v_composition -> 'held') = 'array'
                   THEN v_composition -> 'held' ELSE '[]'::jsonb END,
      'chapters', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'key', chapter.value -> 'key',
          'headline', COALESCE(
            NULLIF(v_overrides -> 'chapters' -> (chapter.value ->> 'key') -> 'headline', 'null'::jsonb),
            chapter.value -> 'headline'),
          'standing', COALESCE(
            NULLIF(v_overrides -> 'chapters' -> (chapter.value ->> 'key') -> 'standing', 'null'::jsonb),
            chapter.value -> 'standing')
        ) ORDER BY chapter.ordinality)
        FROM jsonb_array_elements(
          CASE WHEN jsonb_typeof(v_composition -> 'chapters') = 'array'
               THEN v_composition -> 'chapters' ELSE '[]'::jsonb END
        ) WITH ORDINALITY AS chapter(value, ordinality)
      ), '[]'::jsonb),
      'doorstep', CASE WHEN jsonb_typeof(v_composition -> 'doorstep') = 'object'
                       THEN jsonb_build_object('standing', v_composition -> 'doorstep' -> 'standing')
                       ELSE 'null'::jsonb END,
      'notice', v_composition -> 'notice'
    ),
    'images', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'assetId', image.asset_id,
        'plateRole', image.plate_role,
        'cropKey', image.crop_key,
        'rank', image.rank,
        'chapterKey', image.chapter_key
      ) ORDER BY image.rank NULLS LAST, image.id)
      FROM public.client_edition_images AS image
      JOIN public.client_plate_assets AS asset
        ON asset.id = image.asset_id AND asset.project_id = p_project_id
      WHERE image.edition_id = v_edition.id
    ), '[]'::jsonb),
    'edition', jsonb_build_object(
      'id', v_edition.id,
      'seq', v_edition.seq,
      'approvedAt', v_edition.approved_at,
      'approvedBy', CASE WHEN v_edition.auto_published THEN 'auto' ELSE 'studio' END,
      'notice', v_composition ->> 'notice'
    )
  );
END;
$$;
