-- ═══════════════════════════════════════════════════════════════════════════
-- 00691 — Mark FF&E lines installed (US-16 C-04; SQ-391)
--
-- Nothing could set project_ffe_items.status = 'installed': the table is
-- RPC-only (00435 a_ffe_rpc_mutation_only_trg, 00438 guard) and no RPC wrote
-- the status, so the close-out blocker (every non-installed line) could never
-- clear. record_project_ffe_installed is the one writer.
--
--   * Only from 'delivered'. A line already 'installed' is left untouched
--     (idempotent re-tap); any other status refuses the whole call.
--   * Ratchet-safe: the UPDATE is guarded by ffe_status_rank (00184), so it
--     can only move a line forward.
--   * Studio-scoped through _ffe_require_studio_project (owner or non-guest
--     co-member of every project the ids touch).
--   * installed_on records the install day the studio enters (defaults to
--     today). It is a new nullable column; last_status_change_at keeps its
--     now() stamp from stamp_ffe_status_change.
--
-- Adds GRANT/REVOKE → regenerate supabase/seed/00-legacy-grants.sql.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.project_ffe_items
  ADD COLUMN IF NOT EXISTS installed_on date;

COMMENT ON COLUMN public.project_ffe_items.installed_on IS
  'Install day the studio recorded through record_project_ffe_installed (00691).';

CREATE OR REPLACE FUNCTION public.record_project_ffe_installed(
  p_item_ids uuid[], p_installed_on date DEFAULT NULL
)
RETURNS SETOF public.project_ffe_items
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $$
DECLARE
  v_ids uuid[];
  v_project_id uuid;
  v_found integer;
  v_bad text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT array_agg(DISTINCT id) INTO v_ids
  FROM unnest(COALESCE(p_item_ids, '{}'::uuid[])) AS id WHERE id IS NOT NULL;
  IF COALESCE(cardinality(v_ids), 0) = 0 THEN
    RAISE EXCEPTION 'record_project_ffe_installed: at least one line is required'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Lock in id order so concurrent calls cannot deadlock.
  PERFORM 1 FROM public.project_ffe_items
  WHERE id = ANY(v_ids) ORDER BY id FOR UPDATE;
  SELECT count(*) INTO v_found FROM public.project_ffe_items
  WHERE id = ANY(v_ids) AND removed_at IS NULL;
  IF v_found <> cardinality(v_ids) THEN
    RAISE EXCEPTION 'project not found or access denied'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  FOR v_project_id IN
    SELECT DISTINCT project_id FROM public.project_ffe_items WHERE id = ANY(v_ids)
  LOOP
    PERFORM public._ffe_require_studio_project(v_project_id);
  END LOOP;

  SELECT string_agg(format('%s (%s)', name, status), ', ' ORDER BY name) INTO v_bad
  FROM public.project_ffe_items
  WHERE id = ANY(v_ids) AND status NOT IN ('delivered', 'installed');
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'record_project_ffe_installed: only delivered lines can be marked installed: %', v_bad
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM set_config('app.ffe_mutation_rpc', 'on', true);
  UPDATE public.project_ffe_items
     SET status = 'installed',
         installed_on = COALESCE(p_installed_on, CURRENT_DATE),
         updated_at = now()
   WHERE id = ANY(v_ids)
     AND status = 'delivered'
     AND public.ffe_status_rank(status) < public.ffe_status_rank('installed');

  RETURN QUERY
    SELECT * FROM public.project_ffe_items WHERE id = ANY(v_ids) ORDER BY id;
END;
$$;

REVOKE ALL ON FUNCTION public.record_project_ffe_installed(uuid[], date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_project_ffe_installed(uuid[], date) TO authenticated;
