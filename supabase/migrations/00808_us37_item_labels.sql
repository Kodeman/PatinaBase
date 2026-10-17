-- ═══════════════════════════════════════════════════════════════════════════
-- 00808 — Per-job item labels on doc_code (US-37 #3, SQ-1100; contract D3)
--
-- Each item in a job carries a label unique within that job, so the item
-- list, the client presentation and future POs name items the same way. The
-- label IS project_ffe_items.doc_code (00262): it already flows to the client
-- approval docCode (00423), spec books and the readiness 'documentCode' rule.
--
-- Rules:
--   * A new item without a label gets the next one for its job, under
--     pg_advisory_xact_lock(hashtext('ffe_label:' || project_id)).
--       - In a room: the room's initials, then -NN. Up to 3 words give one
--         letter each, ignoring "and", "&" and "the"; a single word gives its
--         first 2 letters. "Living Room" → LR-01, "Kitchen" → KI-01,
--         "Primary Bath and Closet" → PBC-01. Three digits after 99.
--       - Without a room: 001, 002… Three digits, more after 999.
--       - The next number is max(number in that series in the job) + 1, never
--         a count. Removed and replaced items count, so a number is never
--         handed out twice.
--   * A label is unique among the job's live items: case- and edge-space-
--     insensitive, ignoring removed items and superseded (replaced) items.
--     A replacement carries its predecessor's label (supersede, 00758).
--   * An item ENTERING the job (insert, restore, move to another job) never
--     fails over a label: a taken label is dropped and the next one assigned.
--     Activation carries proposal codes, and proposal twins are allowed
--     (00262: "imports must never break").
--   * EDITING a live item's label to one another live item uses raises 23505
--     "Another item in this job already uses LR-01." (HINT item_label_taken).
--     A blank edit gives the item the next automatic label.
--   * Moving an item to another room never relabels it.
--
-- New: _ffe_item_label_prefix, _ffe_next_item_label, ffe_assign_item_label
-- (BEFORE INSERT/UPDATE trigger zz_ffe_assign_item_label_trg), the unique index
-- project_ffe_items_label_unique, _ffe_backfill_item_labels, and the writer
-- set_project_ffe_item_label (no project-side doc_code writer existed; direct
-- writes are RPC-only, guard_ffe_rpc_mutation 00438).
--
-- Backfill: live items without a label, per job in sort_order, created_at,
-- id order. Existing codes are untouched, except a later twin: where two live
-- items in a job already share a label (proposal twins carried by activation),
-- the first keeps it and the later one gets the next label, so the unique
-- index can build. User triggers are disabled for the
-- backfill (00729 pattern) so updated_at keeps its meaning. A removed item
-- without a label gets one if it is restored.
--
-- Lineage: no function is redefined. Reconciles: none.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. The room prefix (pure) ──────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public._ffe_item_label_prefix(p_room_name text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
PARALLEL SAFE
SET search_path TO 'pg_catalog'
AS $$
DECLARE
  v_words text[];
BEGIN
  -- Words are runs of letters and digits; an apostrophe stays inside its
  -- word ("Kid's" is one word). "&" and other punctuation separate words.
  SELECT array_agg(cleaned.word ORDER BY cleaned.ord)
  INTO v_words
  FROM (
    SELECT regexp_replace(part.word, '[''’]', '', 'g') AS word, part.ord
    FROM regexp_split_to_table(COALESCE(p_room_name, ''), '[^[:alnum:]''’]+')
      WITH ORDINALITY AS part(word, ord)
  ) AS cleaned
  WHERE cleaned.word <> ''
    AND lower(cleaned.word) NOT IN ('and', 'the');

  IF v_words IS NULL THEN
    RETURN NULL;
  END IF;
  IF cardinality(v_words) = 1 THEN
    RETURN upper(left(v_words[1], 2));
  END IF;
  RETURN upper(left(v_words[1], 1) || left(v_words[2], 1) || COALESCE(left(v_words[3], 1), ''));
END;
$$;

COMMENT ON FUNCTION public._ffe_item_label_prefix(text) IS
  'Room initials for an item label (00808): first letter of up to 3 words, ignoring and/&/the; a single word gives 2 letters. NULL when the name has no letters or digits.';

-- ─── 2. The next label in a job ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public._ffe_next_item_label(p_project_id uuid, p_room_id uuid)
RETURNS text
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_prefix text;
  v_next numeric;
BEGIN
  IF p_room_id IS NOT NULL THEN
    SELECT public._ffe_item_label_prefix(room.name)
    INTO v_prefix
    FROM public.project_rooms AS room
    WHERE room.id = p_room_id;
  END IF;

  IF v_prefix IS NULL THEN
    SELECT COALESCE(max(btrim(item.doc_code)::numeric), 0) + 1
    INTO v_next
    FROM public.project_ffe_items AS item
    WHERE item.project_id = p_project_id
      AND btrim(item.doc_code) ~ '^[0-9]+$';
    RETURN CASE WHEN v_next < 1000 THEN lpad(v_next::text, 3, '0') ELSE v_next::text END;
  END IF;

  -- The prefix is letters and digits only, so it is safe inside the pattern.
  SELECT COALESCE(max(substring(btrim(item.doc_code) FROM '-([0-9]+)$')::numeric), 0) + 1
  INTO v_next
  FROM public.project_ffe_items AS item
  WHERE item.project_id = p_project_id
    AND btrim(item.doc_code) ~* ('^' || v_prefix || '-[0-9]+$');
  RETURN v_prefix || '-'
    || CASE WHEN v_next < 100 THEN lpad(v_next::text, 2, '0') ELSE v_next::text END;
END;
$$;

COMMENT ON FUNCTION public._ffe_next_item_label(uuid, uuid) IS
  'Next item label for a job (00808): room prefix + -NN, or 001… without a room; max of the series + 1 over every item in the job, removed and replaced included. Call under the ffe_label advisory lock.';

-- ─── 3. Assign on insert, refuse a clashing edit ────────────────────────────

CREATE OR REPLACE FUNCTION public.ffe_assign_item_label()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_live boolean := NEW.removed_at IS NULL
    AND NEW.design_disposition IS DISTINCT FROM 'superseded';
  v_entering boolean := true;
  v_taken text;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    -- A removed or replaced item holds no label against the others.
    IF NOT v_live THEN
      RETURN NEW;
    END IF;
    v_entering := OLD.removed_at IS NOT NULL
      OR OLD.design_disposition = 'superseded'
      OR NEW.project_id IS DISTINCT FROM OLD.project_id;
    IF NOT v_entering
       AND btrim(COALESCE(NEW.doc_code, '')) <> ''
       AND lower(btrim(NEW.doc_code)) = lower(btrim(COALESCE(OLD.doc_code, ''))) THEN
      RETURN NEW;
    END IF;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('ffe_label:' || NEW.project_id::text));

  IF btrim(COALESCE(NEW.doc_code, '')) = '' THEN
    NEW.doc_code := public._ffe_next_item_label(NEW.project_id, NEW.project_room_id);
    RETURN NEW;
  END IF;
  IF NOT v_live THEN
    RETURN NEW;
  END IF;

  SELECT btrim(peer.doc_code)
  INTO v_taken
  FROM public.project_ffe_items AS peer
  WHERE peer.project_id = NEW.project_id
    AND peer.id <> NEW.id
    AND peer.removed_at IS NULL
    AND peer.design_disposition <> 'superseded'
    AND lower(btrim(peer.doc_code)) = lower(btrim(NEW.doc_code))
  LIMIT 1;

  IF v_taken IS NULL THEN
    RETURN NEW;
  END IF;
  IF v_entering THEN
    -- Insert, restore or move: never fail. The taken label is dropped.
    NEW.doc_code := public._ffe_next_item_label(NEW.project_id, NEW.project_room_id);
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Another item in this job already uses %.', v_taken
    USING ERRCODE = 'unique_violation', HINT = 'item_label_taken';
END;
$$;

COMMENT ON FUNCTION public.ffe_assign_item_label() IS
  'BEFORE INSERT/UPDATE on project_ffe_items (00808): assigns a blank label, drops a taken label for an item entering the job, refuses (23505) an edit to a label another live item uses.';

DROP TRIGGER IF EXISTS zz_ffe_assign_item_label_trg ON public.project_ffe_items;
CREATE TRIGGER zz_ffe_assign_item_label_trg
  BEFORE INSERT OR UPDATE OF doc_code, removed_at, design_disposition, project_id
  ON public.project_ffe_items
  FOR EACH ROW EXECUTE FUNCTION public.ffe_assign_item_label();

-- ─── 4. Backfill ────────────────────────────────────────────────────────────
-- Activation carries proposal codes and proposal twins are allowed, so a job
-- can already hold two live items with one label. The first (sort_order,
-- created_at, id) keeps it; a later twin gets the next label, as an item
-- entering the job would. Otherwise the unique index below could not build.

CREATE OR REPLACE FUNCTION public._ffe_backfill_item_labels()
RETURNS integer
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_item record;
  v_count integer := 0;
BEGIN
  FOR v_item IN
    SELECT live.id, live.project_id, live.project_room_id
    FROM (
      SELECT item.id, item.project_id, item.project_room_id, item.doc_code,
        item.sort_order, item.created_at,
        row_number() OVER (
          PARTITION BY item.project_id, lower(btrim(item.doc_code))
          ORDER BY item.sort_order, item.created_at, item.id
        ) AS label_rank
      FROM public.project_ffe_items AS item
      WHERE item.removed_at IS NULL
        AND item.design_disposition <> 'superseded'
    ) AS live
    WHERE btrim(COALESCE(live.doc_code, '')) = ''
       OR live.label_rank > 1
    ORDER BY live.project_id, live.sort_order, live.created_at, live.id
  LOOP
    UPDATE public.project_ffe_items
    SET doc_code = public._ffe_next_item_label(v_item.project_id, v_item.project_room_id)
    WHERE id = v_item.id;
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;

COMMENT ON FUNCTION public._ffe_backfill_item_labels() IS
  'One-time label backfill (00808): live items without a label, and later twins of a label two live items in a job share, per job in sort_order, created_at, id order; each gets the next label. Idempotent; returns how many it labeled.';

DO $$
BEGIN
  ALTER TABLE public.project_ffe_items DISABLE TRIGGER USER;
  PERFORM public._ffe_backfill_item_labels();
  ALTER TABLE public.project_ffe_items ENABLE TRIGGER USER;
END;
$$;

-- ─── 5. Unique among the job's live items ───────────────────────────────────
-- The trigger's check gives the plain sentence; the index is the backstop
-- for any write that races it. Built after the backfill has parted twins.

CREATE UNIQUE INDEX IF NOT EXISTS project_ffe_items_label_unique
  ON public.project_ffe_items (project_id, lower(btrim(doc_code)))
  WHERE doc_code IS NOT NULL
    AND btrim(doc_code) <> ''
    AND removed_at IS NULL
    AND design_disposition <> 'superseded';

-- ─── 6. The writer ──────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.set_project_ffe_item_label(p_item_id uuid, p_label text)
RETURNS public.project_ffe_items
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_item public.project_ffe_items%ROWTYPE;
BEGIN
  SELECT * INTO v_item FROM public.project_ffe_items WHERE id = p_item_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'project not found or access denied'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  PERFORM public._ffe_require_studio_project(v_item.project_id);
  IF v_item.removed_at IS NOT NULL THEN
    RAISE EXCEPTION 'This item was removed from the job.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Free text, trimmed. Blank gives the next automatic label (the trigger).
  UPDATE public.project_ffe_items
  SET doc_code = NULLIF(btrim(COALESCE(p_label, '')), '')
  WHERE id = p_item_id
  RETURNING * INTO v_item;
  RETURN v_item;
END;
$$;

COMMENT ON FUNCTION public.set_project_ffe_item_label(uuid, text) IS
  'Set an item''s per-job label (doc_code, 00808). Free text, trimmed; blank assigns the next automatic label; a label another live item in the job uses raises 23505 "Another item in this job already uses X." (HINT item_label_taken).';

-- ─── 7. Grants ──────────────────────────────────────────────────────────────

REVOKE ALL ON FUNCTION public._ffe_item_label_prefix(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._ffe_next_item_label(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ffe_assign_item_label() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._ffe_backfill_item_labels() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_project_ffe_item_label(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_project_ffe_item_label(uuid, text) TO authenticated;
