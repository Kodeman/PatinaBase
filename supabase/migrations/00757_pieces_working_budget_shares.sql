-- ═══════════════════════════════════════════════════════════════════════════
-- 00757 — the working budget splits a placed line across its rooms by share
--         (US-21 T-51b, SQ-690; filed by the T-51 audit, SQ-657)
-- ═══════════════════════════════════════════════════════════════════════════
-- D7 phase 3: every per-room money reader splits a placed line by share. The
-- Account Page already does (T-51, use-account-page.ts accountRoomRows). The
-- Derived Budget Grid did not: the oak floor (913 sq ft placed Hall 120 ·
-- Living 320 · Dining 180 · Kitchen 210) read Hall × flooring $10,499.50
-- scheduled and $0 in the other three rooms.
--
-- The share rule, identical to accountRoomRows:
--   - a line with 2 or more project_ffe_placements rows splits its rollup
--     amount by placed quantity over the placed sum;
--   - cents go by largest remainder, ties to placement order (sort_order,
--     then created_at, id);
--   - a line with 0 or 1 placements counts whole in project_room_id, as
--     before;
--   - the job total never changes: a line's slices sum to its amount.
--
-- CREATE OR REPLACE bases, each the newest body, full copy plus the change:
--   _derive_working_budget_draft_00661_impl  00423:3173 (renamed by 00661:513)
--   _publish_budget_checkpoint_00661_impl    00578:3305 (renamed by 00661:528)
-- The public wrappers (00661:518, 00661:533) and get_project_working_budget
-- (00422:1005) are unchanged. No signature, return shape, grant or type
-- changes.
--
-- What changes, and what stays frozen:
--   - derive: the rollup that mints a new draft line's target_cents. Additive
--     as before: an existing (version, room, category) line is never
--     rewritten.
--   - publish: the `scheduled` stamp written into scheduled_cents when a draft
--     version is published. A published version's stamp is never rewritten.
--   - publish's `authorized` stamp and get_project_working_budget's
--     liveAuthorizedCents / liveAuthorizedTotalCents are UNCHANGED. They sum
--     furnishing_authorization_items, the frozen release snapshot, whose room
--     is the primary room it was signed under.
--
-- The share expansion is written out in both bodies (a public helper would
-- reach the generated types). The two copies must stay identical.
-- ═══════════════════════════════════════════════════════════════════════════

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

  RETURN public.get_project_working_budget(p_project_id);
END;
$$;
REVOKE ALL ON FUNCTION public._derive_working_budget_draft_00661_impl(uuid)
  FROM PUBLIC, anon, authenticated, service_role;

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
  IF NOT EXISTS (
    SELECT 1 FROM public.project_commercial_documents d
    JOIN public.proposals p ON p.id = d.proposal_id
    WHERE d.project_id = p_project_id AND d.is_origin
      AND d.document_kind IN ('design_services', 'design_build') AND p.commercial_state = 'executed'
  ) THEN
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
    'publishedAt', v_checkpoint.published_at
  );
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('app.budget_publish_id', COALESCE(v_previous_publish, ''), true);
  RAISE;
END;
$$;
REVOKE ALL ON FUNCTION public._publish_budget_checkpoint_00661_impl(uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
