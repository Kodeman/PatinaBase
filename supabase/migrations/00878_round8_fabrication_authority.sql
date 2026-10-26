-- 00878 — C3 fabrication authority: append-only grants, immediate revocation.
-- Lineage: policies 00624; seat-close body 00634 (hand-close trigger unchanged).
-- Activation is a separately reviewed EXECUTE grant, not a runtime flag.
-- No backfill: existing scopes, grants, SELECT policy and table ACLs stay intact.
ALTER TABLE public.project_party_authority
  DROP CONSTRAINT IF EXISTS project_party_authority_scope_check;
ALTER TABLE public.project_party_authority
  ADD CONSTRAINT project_party_authority_scope_check CHECK
    (scope IN ('money','change_order','selections','schedule','site_access','key','draw_certify','fabrication'));
ALTER TABLE public.project_party_authority
  ADD COLUMN IF NOT EXISTS revoked_at timestamptz,
  ADD COLUMN IF NOT EXISTS ended_by uuid REFERENCES public.profiles(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS end_reason text,
  ADD COLUMN IF NOT EXISTS idempotency_key text,
  ADD COLUMN IF NOT EXISTS fabrication_grant_request jsonb;
ALTER TABLE public.project_party_authority
  DROP CONSTRAINT IF EXISTS project_party_authority_end_reason_check,
  DROP CONSTRAINT IF EXISTS project_party_authority_fabrication_end_check,
  DROP CONSTRAINT IF EXISTS project_party_authority_fabrication_request_check;
ALTER TABLE public.project_party_authority
  ADD CONSTRAINT project_party_authority_end_reason_check CHECK
    (end_reason IS NULL OR end_reason IN ('revoked','seat_closed','superseded')),
  ADD CONSTRAINT project_party_authority_fabrication_end_check CHECK
    (scope <> 'fabrication' OR ((revoked_at IS NULL) = (end_reason IS NULL)
      AND (revoked_at IS NULL) = (ended_by IS NULL))),
  ADD CONSTRAINT project_party_authority_fabrication_request_check CHECK
    (scope = 'fabrication' OR fabrication_grant_request IS NULL);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_party_authority_idempotency
  ON public.project_party_authority(engagement_id,idempotency_key)
  WHERE idempotency_key IS NOT NULL;

DROP POLICY IF EXISTS project_party_authority_studio_insert ON public.project_party_authority;
CREATE POLICY project_party_authority_studio_insert
  ON public.project_party_authority FOR INSERT TO authenticated
  WITH CHECK (
    public.is_active_studio_member(public.project_party_recorded_studio(engagement_id))
    AND public.is_studio_comember(public.project_party_designer(engagement_id))
    AND (scope NOT IN ('money','draw_certify')
      OR public.is_org_admin_or_owner(public.project_party_recorded_studio(engagement_id)))
    AND scope <> 'fabrication'
  );
DROP POLICY IF EXISTS project_party_authority_studio_update ON public.project_party_authority;
CREATE POLICY project_party_authority_studio_update
  ON public.project_party_authority FOR UPDATE TO authenticated
  USING (
    public.is_active_studio_member(public.project_party_recorded_studio(engagement_id))
    AND public.is_studio_comember(public.project_party_designer(engagement_id))
    AND (scope NOT IN ('money','draw_certify')
      OR public.is_org_admin_or_owner(public.project_party_recorded_studio(engagement_id)))
    AND scope <> 'fabrication'
  )
  WITH CHECK (
    public.is_active_studio_member(public.project_party_recorded_studio(engagement_id))
    AND public.is_studio_comember(public.project_party_designer(engagement_id))
    AND (scope NOT IN ('money','draw_certify')
      OR public.is_org_admin_or_owner(public.project_party_recorded_studio(engagement_id)))
    AND scope <> 'fabrication'
  );
DROP POLICY IF EXISTS project_party_authority_studio_delete ON public.project_party_authority;
CREATE POLICY project_party_authority_studio_delete
  ON public.project_party_authority FOR DELETE TO authenticated
  USING (
    public.is_active_studio_member(public.project_party_recorded_studio(engagement_id))
    AND public.is_studio_comember(public.project_party_designer(engagement_id))
    AND (scope NOT IN ('money','draw_certify')
      OR public.is_org_admin_or_owner(public.project_party_recorded_studio(engagement_id)))
    AND scope <> 'fabrication'
  );

CREATE OR REPLACE FUNCTION public.guard_fabrication_grant_overlap()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.scope = 'fabrication' THEN
    PERFORM 1 FROM public.project_parties WHERE id = NEW.engagement_id FOR UPDATE;
    IF NEW.revoked_at IS NULL AND EXISTS (
      SELECT 1 FROM public.project_party_authority a
      WHERE a.engagement_id = NEW.engagement_id AND a.scope = 'fabrication'
        AND a.revoked_at IS NULL
        AND a.effective_from <= COALESCE(NEW.effective_to,'infinity'::date)
        AND NEW.effective_from <= COALESCE(a.effective_to,'infinity'::date)
    ) THEN
      RAISE EXCEPTION 'fabrication_authority_overlap' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_fabrication_grant_overlap() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS guard_fabrication_grant_overlap_trg ON public.project_party_authority;
CREATE TRIGGER guard_fabrication_grant_overlap_trg BEFORE INSERT ON public.project_party_authority
  FOR EACH ROW EXECUTE FUNCTION public.guard_fabrication_grant_overlap();

-- INVOKER identity plus the marker: a caller-set GUC is not writer authority.
-- No parent lock here: UPDATE/DELETE already hold the child (00868 precedent).
CREATE OR REPLACE FUNCTION public.guard_fabrication_authority_immutable()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE v_end date;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.fabrication_grant_request IS DISTINCT FROM OLD.fabrication_grant_request THEN
    RAISE EXCEPTION 'fabrication_authority_immutable' USING ERRCODE = '23514';
  END IF;
  IF OLD.scope = 'fabrication' OR (TG_OP = 'UPDATE' AND NEW.scope = 'fabrication') THEN
    IF TG_OP = 'DELETE' THEN
      RAISE EXCEPTION 'fabrication_authority_immutable' USING ERRCODE = '23514';
    END IF;
    IF current_user IS DISTINCT FROM (SELECT pg_get_userbyid(proowner) FROM pg_proc
        WHERE oid = 'public.guard_fabrication_authority_immutable()'::regprocedure)
      OR current_setting('app.fabrication_authority_write',true) IS DISTINCT FROM OLD.id::text
      OR OLD.scope <> 'fabrication' OR OLD.revoked_at IS NOT NULL
      OR NEW.revoked_at IS DISTINCT FROM now()
      OR NEW.ended_by IS NULL OR NEW.ended_by IS DISTINCT FROM auth.uid()
      OR NEW.end_reason IS NULL OR NEW.end_reason NOT IN ('revoked','superseded','seat_closed')
      OR (to_jsonb(NEW) - ARRAY['effective_to','revoked_at','ended_by','end_reason','updated_at'])
        IS DISTINCT FROM
         (to_jsonb(OLD) - ARRAY['effective_to','revoked_at','ended_by','end_reason','updated_at']) THEN
      RAISE EXCEPTION 'fabrication_authority_immutable' USING ERRCODE = '23514';
    END IF;
    IF NEW.end_reason = 'seat_closed' THEN
      SELECT off_job_at INTO v_end FROM public.project_parties WHERE id = OLD.engagement_id;
    ELSE v_end := current_date;
    END IF;
    IF v_end IS NULL OR NEW.effective_to IS DISTINCT FROM
      LEAST(COALESCE(OLD.effective_to,'infinity'::date),GREATEST(OLD.effective_from,v_end)) THEN
      RAISE EXCEPTION 'fabrication_authority_immutable' USING ERRCODE = '23514';
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_fabrication_authority_immutable() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS guard_fabrication_authority_immutable_trg ON public.project_party_authority;
CREATE TRIGGER guard_fabrication_authority_immutable_trg BEFORE UPDATE OR DELETE ON public.project_party_authority
  FOR EACH ROW EXECUTE FUNCTION public.guard_fabrication_authority_immutable();

CREATE OR REPLACE FUNCTION public.grant_fabrication_authority(
  p_engagement_id uuid, p_effective_from date, p_idempotency_key text,
  p_effective_to date DEFAULT NULL, p_threshold_cents integer DEFAULT NULL,
  p_copy_to uuid[] DEFAULT '{}', p_source_clause text DEFAULT NULL
) RETURNS public.project_party_authority
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_seat public.project_parties; v_row public.project_party_authority; v_request jsonb;
BEGIN
  SELECT * INTO v_seat FROM public.project_parties WHERE id = p_engagement_id FOR UPDATE;
  IF auth.uid() IS NULL OR v_seat.id IS NULL OR NOT COALESCE(
    public.is_active_studio_member(public.project_party_recorded_studio(v_seat.id))
    AND public.is_studio_comember(public.project_party_designer(v_seat.id))
    AND public.is_org_admin_or_owner(public.project_party_recorded_studio(v_seat.id)),false) THEN
    RAISE EXCEPTION 'fabrication_authority_forbidden' USING ERRCODE = '42501';
  END IF;
  PERFORM 1 FROM public.project_party_authority WHERE engagement_id = v_seat.id
    AND scope = 'fabrication' AND revoked_at IS NULL ORDER BY id FOR UPDATE;
  IF p_idempotency_key IS NULL OR btrim(p_idempotency_key) = '' THEN
    RAISE EXCEPTION 'fabrication_authority_idempotency_required' USING ERRCODE = '23514';
  END IF;
  v_request := jsonb_build_object('effective_from',p_effective_from,'effective_to',p_effective_to,
    'threshold_cents',p_threshold_cents,'copy_to',p_copy_to,'source_clause',p_source_clause);
  SELECT * INTO v_row FROM public.project_party_authority
    WHERE engagement_id = v_seat.id AND idempotency_key = p_idempotency_key;
  IF FOUND THEN
    IF v_row.scope <> 'fabrication' OR v_row.granted_by IS DISTINCT FROM auth.uid()
      OR v_row.fabrication_grant_request IS DISTINCT FROM v_request THEN
      RAISE EXCEPTION 'idempotency_key_reused' USING ERRCODE = '23514';
    END IF;
    RETURN v_row;
  END IF;
  IF v_seat.stage <> 'active' OR v_seat.off_job_at IS NOT NULL THEN
    RAISE EXCEPTION 'fabrication_authority_seat_closed' USING ERRCODE = '23514';
  END IF;
  IF v_seat.party_kind NOT IN ('client','client_rep','gc','architect') THEN
    RAISE EXCEPTION 'fabrication_authority_holder_kind' USING ERRCODE = '23514';
  END IF;
  IF p_effective_from IS NULL OR p_effective_to < p_effective_from THEN
    RAISE EXCEPTION 'fabrication_authority_window_invalid' USING ERRCODE = '23514';
  END IF;
  IF EXISTS (SELECT 1 FROM public.project_party_authority WHERE engagement_id = v_seat.id
      AND scope = 'fabrication' AND revoked_at IS NULL AND effective_to IS NULL) THEN
    RAISE EXCEPTION 'fabrication_authority_already_open' USING ERRCODE = '23514';
  END IF;
  IF EXISTS (SELECT 1 FROM public.project_party_authority WHERE engagement_id = v_seat.id
      AND scope = 'fabrication' AND revoked_at IS NULL
      AND effective_from <= COALESCE(p_effective_to,'infinity'::date)
      AND p_effective_from <= COALESCE(effective_to,'infinity'::date)) THEN
    RAISE EXCEPTION 'fabrication_authority_overlap' USING ERRCODE = '23514';
  END IF;
  INSERT INTO public.project_party_authority(engagement_id,scope,effective_from,effective_to,
    threshold_cents,copy_to,source_clause,granted_by,idempotency_key,fabrication_grant_request)
  VALUES(v_seat.id,'fabrication',p_effective_from,p_effective_to,p_threshold_cents,p_copy_to,
    p_source_clause,auth.uid(),p_idempotency_key,v_request) RETURNING * INTO v_row;
  RETURN v_row;
END $$;
REVOKE ALL ON FUNCTION public.grant_fabrication_authority(uuid,date,text,date,integer,uuid[],text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.grant_fabrication_authority(uuid,date,text,date,integer,uuid[],text) TO service_role;

CREATE OR REPLACE FUNCTION public.revoke_fabrication_authority(p_authority_id uuid,p_reason text)
RETURNS public.project_party_authority LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_seat uuid; v_row public.project_party_authority; v_marker text;
BEGIN
  SELECT engagement_id INTO v_seat FROM public.project_party_authority WHERE id = p_authority_id AND scope = 'fabrication';
  PERFORM 1 FROM public.project_parties WHERE id = v_seat FOR UPDATE;
  IF auth.uid() IS NULL OR v_seat IS NULL OR NOT COALESCE(
    public.is_active_studio_member(public.project_party_recorded_studio(v_seat))
    AND public.is_studio_comember(public.project_party_designer(v_seat))
    AND public.is_org_admin_or_owner(public.project_party_recorded_studio(v_seat)),false) THEN
    RAISE EXCEPTION 'fabrication_authority_forbidden' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_row FROM public.project_party_authority WHERE id = p_authority_id AND scope = 'fabrication' FOR UPDATE;
  IF p_reason IS NULL OR p_reason NOT IN ('revoked','superseded') THEN
    RAISE EXCEPTION 'fabrication_authority_reason_invalid' USING ERRCODE = '23514';
  END IF;
  IF v_row.revoked_at IS NOT NULL THEN
    IF v_row.end_reason = p_reason THEN RETURN v_row; END IF;
    RAISE EXCEPTION 'fabrication_authority_already_ended' USING ERRCODE = '23514';
  END IF;
  v_marker := current_setting('app.fabrication_authority_write',true);
  PERFORM set_config('app.fabrication_authority_write',v_row.id::text,true);
  UPDATE public.project_party_authority SET revoked_at = now(), ended_by = auth.uid(), end_reason = p_reason,
    effective_to = LEAST(COALESCE(effective_to,'infinity'::date),GREATEST(effective_from,current_date)),updated_at = now()
    WHERE id = v_row.id RETURNING * INTO v_row;
  PERFORM set_config('app.fabrication_authority_write',COALESCE(v_marker,''),true);
  RETURN v_row;
END $$;
REVOKE ALL ON FUNCTION public.revoke_fabrication_authority(uuid,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_fabrication_authority(uuid,text) TO service_role;

CREATE OR REPLACE FUNCTION public.party_holds_fabrication_authority(
  p_party_id uuid,p_amount_cents bigint,p_on date DEFAULT CURRENT_DATE
) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT p_amount_cents IS NOT NULL AND p_amount_cents >= 0 AND EXISTS (
    SELECT 1 FROM public.project_party_authority a
    WHERE a.engagement_id = p_party_id AND a.scope = 'fabrication' AND NOT a.prepares_only
      AND a.revoked_at IS NULL AND a.effective_from <= p_on
      AND (a.effective_to IS NULL OR a.effective_to >= p_on)
      AND (a.threshold_cents IS NULL OR p_amount_cents <= a.threshold_cents));
$$;
REVOKE ALL ON FUNCTION public.party_holds_fabrication_authority(uuid,bigint,date) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.end_party_authority_at_seat_close()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_open integer; v_principal integer; v_recorded uuid;
  v_fabrication integer; v_row record; v_marker text;
BEGIN
  SELECT count(*),count(*) FILTER (WHERE scope IN ('money','draw_certify','fabrication')),
         count(*) FILTER (WHERE scope = 'fabrication')
    INTO v_open,v_principal,v_fabrication
    FROM public.project_party_authority
   WHERE engagement_id = NEW.id AND (
     (scope <> 'fabrication' AND effective_to IS NULL) OR
     (scope = 'fabrication' AND revoked_at IS NULL AND (effective_to IS NULL OR effective_to >= NEW.off_job_at)));
  IF v_open = 0 THEN RETURN NULL; END IF;
  -- Fabrication requires a retained human principal; legacy SQL closure keeps its carveout.
  IF v_fabrication > 0 AND auth.uid() IS NULL THEN
    RAISE EXCEPTION 'fabrication_authority_seat_close_actor_required' USING ERRCODE = '42501';
  END IF;
  IF auth.uid() IS NOT NULL THEN
    v_recorded := public.project_party_recorded_studio(NEW.id);
    IF NOT (public.is_active_studio_member(v_recorded)
            AND public.is_studio_comember(public.project_party_designer(NEW.id))) THEN
      RAISE EXCEPTION 'seat_close_authority_forbidden'
        USING HINT = 'This seat carries a standing grant recorded in another '
                     'studio''s book. Ask that studio to close the seat.';
    END IF;
    IF v_principal > 0 AND NOT public.is_org_admin_or_owner(v_recorded) THEN
      RAISE EXCEPTION 'seat_close_money_authority_forbidden'
        USING HINT = 'This seat signs for money or fabrication, and ending that is the '
                     'principal''s to do (PR-n). Ask an owner or an admin of '
                     'the studio to close the seat.';
    END IF;
  END IF;
  UPDATE public.project_party_authority
     SET effective_to = GREATEST(effective_from,NEW.off_job_at),updated_at = now()
   WHERE engagement_id = NEW.id AND scope <> 'fabrication' AND effective_to IS NULL;
  v_marker := current_setting('app.fabrication_authority_write',true);
  FOR v_row IN SELECT id FROM public.project_party_authority
    WHERE engagement_id = NEW.id AND scope = 'fabrication' AND revoked_at IS NULL
      AND (effective_to IS NULL OR effective_to >= NEW.off_job_at) ORDER BY id FOR UPDATE LOOP
    PERFORM set_config('app.fabrication_authority_write',v_row.id::text,true);
    UPDATE public.project_party_authority
      SET revoked_at = now(),ended_by = auth.uid(),end_reason = 'seat_closed',
        effective_to = LEAST(COALESCE(effective_to,'infinity'::date),GREATEST(effective_from,NEW.off_job_at)),updated_at = now()
      WHERE id = v_row.id;
  END LOOP;
  PERFORM set_config('app.fabrication_authority_write',COALESCE(v_marker,''),true);
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.end_party_authority_at_seat_close() FROM PUBLIC, anon, authenticated;
COMMENT ON FUNCTION public.end_party_authority_at_seat_close() IS
  '00634 hand-close semantics preserved for legacy scopes. Unrevoked, non-lapsed fabrication grants (finite and pending included) require a recorded-studio principal and end immediately with a retained actor. The existing withdrawal WHEN exclusion is unchanged.';
