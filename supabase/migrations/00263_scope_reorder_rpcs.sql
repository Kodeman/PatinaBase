-- 00263_scope_reorder_rpcs.sql
-- Track S · S3 (Schedule & Boards Wave 1): drag-reorder RPCs.
--
-- The pre-sale schedule builder gains dnd-kit sortable rows (items within a
-- room) and sortable rooms. Persisting an order was previously append-only
-- (max(position)+1 / max(sort_order)+1); these RPCs set the WHOLE ordering in
-- one statement from a client-supplied id array.
--
-- SECURITY INVOKER — the write runs under the caller's RLS, so authorization
-- is exactly the existing table policies:
--   • proposal_items          — "Inherit proposal access" (proposal designer/client)
--   • proposal_scope_rooms     — "Designers manage their proposal scope rooms"
-- Each function ALSO verifies every supplied id belongs to p_proposal_id and
-- rejects duplicates, so a caller can never reorder across proposals or smuggle
-- a foreign id through (raises, rolls back the whole call). Ordering columns are
-- set to the array index via UPDATE … FROM unnest(...) WITH ORDINALITY.

-- ── Items within a proposal (ordering column: proposal_items.position) ──
CREATE OR REPLACE FUNCTION public.reorder_proposal_items(
  p_proposal_id uuid,
  p_ordered_ids uuid[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_expected int := COALESCE(array_length(p_ordered_ids, 1), 0);
  v_distinct int;
  v_matched  int;
BEGIN
  IF v_expected = 0 THEN
    RETURN; -- nothing to reorder
  END IF;

  -- Reject duplicate ids in the input (cardinality guard).
  SELECT count(DISTINCT x) INTO v_distinct FROM unnest(p_ordered_ids) AS x;
  IF v_distinct <> v_expected THEN
    RAISE EXCEPTION 'reorder_proposal_items: duplicate ids in ordering (% distinct of %)',
      v_distinct, v_expected;
  END IF;

  -- Every id must belong to this proposal (rejects foreign / cross-proposal ids).
  SELECT count(*) INTO v_matched
  FROM proposal_items
  WHERE proposal_id = p_proposal_id
    AND id = ANY(p_ordered_ids);

  IF v_matched <> v_expected THEN
    RAISE EXCEPTION 'reorder_proposal_items: % of % ids do not belong to proposal %',
      v_expected - v_matched, v_expected, p_proposal_id;
  END IF;

  -- Set position = 0-based array index in one statement. The RLS policy still
  -- gates the UPDATE; the proposal_id predicate is belt-and-suspenders.
  UPDATE proposal_items pi
     SET position = ord.idx - 1
    FROM (
      SELECT id, ordinality AS idx
      FROM unnest(p_ordered_ids) WITH ORDINALITY AS t(id, ordinality)
    ) AS ord
   WHERE pi.id = ord.id
     AND pi.proposal_id = p_proposal_id;
END;
$$;

-- ── Scope rooms within a proposal (ordering column: proposal_scope_rooms.sort_order) ──
CREATE OR REPLACE FUNCTION public.reorder_proposal_scope_rooms(
  p_proposal_id uuid,
  p_ordered_ids uuid[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_expected int := COALESCE(array_length(p_ordered_ids, 1), 0);
  v_distinct int;
  v_matched  int;
BEGIN
  IF v_expected = 0 THEN
    RETURN;
  END IF;

  SELECT count(DISTINCT x) INTO v_distinct FROM unnest(p_ordered_ids) AS x;
  IF v_distinct <> v_expected THEN
    RAISE EXCEPTION 'reorder_proposal_scope_rooms: duplicate ids in ordering (% distinct of %)',
      v_distinct, v_expected;
  END IF;

  SELECT count(*) INTO v_matched
  FROM proposal_scope_rooms
  WHERE proposal_id = p_proposal_id
    AND id = ANY(p_ordered_ids);

  IF v_matched <> v_expected THEN
    RAISE EXCEPTION 'reorder_proposal_scope_rooms: % of % ids do not belong to proposal %',
      v_expected - v_matched, v_expected, p_proposal_id;
  END IF;

  UPDATE proposal_scope_rooms r
     SET sort_order = ord.idx - 1
    FROM (
      SELECT id, ordinality AS idx
      FROM unnest(p_ordered_ids) WITH ORDINALITY AS t(id, ordinality)
    ) AS ord
   WHERE r.id = ord.id
     AND r.proposal_id = p_proposal_id;
END;
$$;

REVOKE ALL ON FUNCTION public.reorder_proposal_items(uuid, uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reorder_proposal_items(uuid, uuid[]) TO authenticated;

REVOKE ALL ON FUNCTION public.reorder_proposal_scope_rooms(uuid, uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reorder_proposal_scope_rooms(uuid, uuid[]) TO authenticated;
