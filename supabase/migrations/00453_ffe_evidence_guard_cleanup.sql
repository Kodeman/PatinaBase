-- 00453 — Freeze board media evidence and restore the one-time linkage capability.

CREATE OR REPLACE FUNCTION public.guard_project_review_board_media_evidence()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public', 'pg_temp' AS $$
DECLARE v_status text;
BEGIN
  SELECT status INTO v_status FROM public.project_review_editions
  WHERE id = COALESCE(NEW.edition_id, OLD.edition_id);
  IF TG_OP = 'INSERT' THEN
    IF current_setting('app.project_review_publish', true) <> 'on'
       OR v_status NOT IN ('published','superseded','finalized') THEN
      RAISE EXCEPTION 'board review media evidence is publication-owned'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'published board review media evidence is immutable'
    USING ERRCODE = 'check_violation';
END;
$$;
DROP TRIGGER IF EXISTS guard_project_review_board_media_evidence_trg
  ON public.project_review_board_media_assets;
CREATE TRIGGER guard_project_review_board_media_evidence_trg
BEFORE INSERT OR UPDATE OR DELETE ON public.project_review_board_media_assets
FOR EACH ROW EXECUTE FUNCTION public.guard_project_review_board_media_evidence();

ALTER FUNCTION public.start_purchase_order_change(jsonb)
  RENAME TO _start_purchase_order_change_00452_impl;
REVOKE ALL ON FUNCTION public._start_purchase_order_change_00452_impl(jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
CREATE OR REPLACE FUNCTION public.start_purchase_order_change(p_request jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $$
DECLARE
  v_previous text := current_setting('app.po_change_replacement_link', true);
  v_result jsonb;
BEGIN
  v_result := public._start_purchase_order_change_00452_impl(p_request);
  PERFORM set_config('app.po_change_replacement_link', COALESCE(v_previous, ''), true);
  RETURN v_result;
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('app.po_change_replacement_link', COALESCE(v_previous, ''), true);
  RAISE;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_project_review_board_media_evidence()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.start_purchase_order_change(jsonb)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.start_purchase_order_change(jsonb)
  TO authenticated;
