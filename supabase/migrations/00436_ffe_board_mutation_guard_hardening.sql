-- 00436 — Prevent authenticated callers from spoofing project-board RPC writes.

CREATE OR REPLACE FUNCTION public.guard_project_board_rpc_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_is_project_board boolean := false;
BEGIN
  IF auth.uid() IS NULL OR current_user IN ('postgres', 'service_role') THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF TG_TABLE_NAME = 'proposal_boards' THEN
    v_is_project_board := COALESCE(NEW.project_id, OLD.project_id) IS NOT NULL;
  ELSE
    SELECT EXISTS (
      SELECT 1
      FROM public.proposal_boards board
      WHERE board.project_id IS NOT NULL
        AND board.id IN (NEW.board_id, OLD.board_id)
    )
    INTO v_is_project_board;
  END IF;

  IF v_is_project_board THEN
    RAISE EXCEPTION 'project board state writes are RPC-only'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

REVOKE ALL ON FUNCTION public.guard_project_board_rpc_mutation()
FROM PUBLIC, anon, authenticated, service_role;
