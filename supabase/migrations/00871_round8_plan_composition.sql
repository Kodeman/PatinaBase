-- 00871 — C1 room/package drawing composition, not fabrication authority.
-- Reuses 00868 can_compose_project_plan unchanged; no plan-room writer,
-- issue snapshot, holdings projection, historical row or manifest is rewritten.

CREATE TABLE IF NOT EXISTS public.project_packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE RESTRICT,
  package_kind text NOT NULL CHECK (package_kind IN ('cabinetry','build')),
  code text NOT NULL CHECK (length(btrim(code)) BETWEEN 1 AND 32),
  package_key text CHECK (package_key ~ '^pkg\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$'),
  title text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 200),
  project_room_id uuid REFERENCES public.project_rooms(id) ON DELETE SET NULL,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz,
  idempotency_key text NOT NULL CHECK (btrim(idempotency_key) <> ''),
  request_hash text NOT NULL,
  UNIQUE (project_id,idempotency_key)
);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_project_packages_code
  ON public.project_packages(project_id,upper(btrim(code))) WHERE archived_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_project_packages_key
  ON public.project_packages(project_id,package_key) WHERE package_key IS NOT NULL;
CREATE TABLE IF NOT EXISTS public.plan_sheet_rooms (
  sheet_id uuid NOT NULL REFERENCES public.plan_sheets(id) ON DELETE RESTRICT,
  project_room_id uuid NOT NULL REFERENCES public.project_rooms(id) ON DELETE CASCADE,
  added_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  added_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (sheet_id,project_room_id)
);
CREATE TABLE IF NOT EXISTS public.plan_sheet_packages (
  sheet_id uuid NOT NULL REFERENCES public.plan_sheets(id) ON DELETE RESTRICT,
  package_id uuid NOT NULL REFERENCES public.project_packages(id) ON DELETE RESTRICT,
  added_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  added_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (sheet_id,package_id)
);

-- Room SHARE locks conflict with a concurrent project_id UPDATE. The parent
-- guard reads references without locking children, so it never reverses the
-- native writer order: project -> sheet (if any) -> rooms by UUID -> join rows.
CREATE OR REPLACE FUNCTION public._guard_plan_composition() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE job uuid; target_job uuid;
BEGIN
  IF TG_TABLE_NAME = 'project_rooms' THEN
    IF NEW.project_id IS DISTINCT FROM OLD.project_id AND (
      EXISTS (SELECT 1 FROM public.plan_sheet_rooms WHERE project_room_id=OLD.id)
      OR EXISTS (SELECT 1 FROM public.project_packages WHERE project_room_id=OLD.id)
    ) THEN
      RAISE EXCEPTION 'plan_composition_room_project_immutable' USING ERRCODE='23514';
    END IF;
  ELSIF TG_TABLE_NAME = 'project_packages' THEN
    IF TG_OP = 'UPDATE' AND (NEW.project_id IS DISTINCT FROM OLD.project_id
       OR (OLD.package_key IS NOT NULL AND NEW.package_key IS DISTINCT FROM OLD.package_key)) THEN
      RAISE EXCEPTION 'package_key_immutable' USING ERRCODE='23514';
    END IF;
    IF NEW.project_room_id IS NOT NULL THEN
      SELECT project_id INTO target_job FROM public.project_rooms WHERE id=NEW.project_room_id FOR SHARE;
      IF target_job IS DISTINCT FROM NEW.project_id THEN
        RAISE EXCEPTION 'plan_sheet_link_off_project' USING ERRCODE='23514';
      END IF;
    END IF;
  ELSE
    SELECT project_id INTO job FROM public.plan_sheets WHERE id=NEW.sheet_id;
    IF TG_TABLE_NAME='plan_sheet_rooms' THEN
      SELECT project_id INTO target_job FROM public.project_rooms WHERE id=NEW.project_room_id FOR SHARE;
    ELSE
      SELECT project_id INTO target_job FROM public.project_packages WHERE id=NEW.package_id;
    END IF;
    IF job IS NULL OR target_job IS DISTINCT FROM job THEN
      RAISE EXCEPTION 'plan_sheet_link_off_project' USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public._guard_plan_composition() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS guard_plan_composition_room_project ON public.project_rooms;
CREATE TRIGGER guard_plan_composition_room_project BEFORE UPDATE OF project_id ON public.project_rooms
FOR EACH ROW EXECUTE FUNCTION public._guard_plan_composition();
DROP TRIGGER IF EXISTS guard_plan_composition ON public.project_packages;
CREATE TRIGGER guard_plan_composition BEFORE INSERT OR UPDATE ON public.project_packages
FOR EACH ROW EXECUTE FUNCTION public._guard_plan_composition();
DROP TRIGGER IF EXISTS guard_plan_composition ON public.plan_sheet_rooms;
CREATE TRIGGER guard_plan_composition BEFORE INSERT OR UPDATE ON public.plan_sheet_rooms
FOR EACH ROW EXECUTE FUNCTION public._guard_plan_composition();
DROP TRIGGER IF EXISTS guard_plan_composition ON public.plan_sheet_packages;
CREATE TRIGGER guard_plan_composition BEFORE INSERT OR UPDATE ON public.plan_sheet_packages
FOR EACH ROW EXECUTE FUNCTION public._guard_plan_composition();

REVOKE ALL ON FUNCTION public.can_compose_project_plan(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.can_compose_project_plan(uuid) TO authenticated, service_role;
ALTER TABLE public.project_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plan_sheet_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plan_sheet_packages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS plan_composition_read ON public.project_packages;
CREATE POLICY plan_composition_read ON public.project_packages FOR SELECT TO authenticated
USING (public.can_compose_project_plan(project_id));
DROP POLICY IF EXISTS plan_composition_read ON public.plan_sheet_rooms;
CREATE POLICY plan_composition_read ON public.plan_sheet_rooms FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.plan_sheets s JOIN public.projects p ON p.id=s.project_id
  WHERE s.id=sheet_id AND (public.can_compose_project_plan(s.project_id)
    OR (s.state='shared' AND p.client_id=(SELECT auth.uid())))));
DROP POLICY IF EXISTS plan_composition_read ON public.plan_sheet_packages;
CREATE POLICY plan_composition_read ON public.plan_sheet_packages FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.plan_sheets s JOIN public.projects p ON p.id=s.project_id
  WHERE s.id=sheet_id AND (public.can_compose_project_plan(s.project_id)
    OR (s.state='shared' AND p.client_id=(SELECT auth.uid())))));
REVOKE ALL ON public.project_packages, public.plan_sheet_rooms, public.plan_sheet_packages FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.project_packages, public.plan_sheet_rooms, public.plan_sheet_packages TO authenticated;
GRANT ALL ON public.project_packages, public.plan_sheet_rooms, public.plan_sheet_packages TO service_role;

CREATE OR REPLACE FUNCTION public._assert_plan_package_key(p_project_id uuid,p_key text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.project_scope_editions e
    JOIN public.project_scope_edition_packages p ON p.edition_id=e.id
    WHERE e.project_id=p_project_id AND e.status='active' AND p.package_key=p_key) THEN
    RAISE EXCEPTION 'package_key_not_in_edition' USING ERRCODE='23514';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public._assert_plan_package_key(uuid,text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.create_project_package(
  p_project_id uuid,p_kind text,p_code text,p_title text,p_idempotency_key text,
  p_project_room_id uuid DEFAULT NULL,p_package_key text DEFAULT NULL
) RETURNS public.project_packages LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE result public.project_packages; fingerprint text;
BEGIN
  -- Serialize allocation/replay on the job without changing the global C2 lock order.
  PERFORM 1 FROM public.projects WHERE id=p_project_id FOR UPDATE;
  IF NOT public.can_compose_project_plan(p_project_id) THEN
    RAISE EXCEPTION 'plan_composition_forbidden' USING ERRCODE='42501'; END IF;
  fingerprint := encode(extensions.digest(convert_to(jsonb_build_object(
    'projectId',p_project_id,'kind',p_kind,'code',p_code,'title',p_title,
    'roomId',p_project_room_id,'packageKey',p_package_key)::text,'UTF8'),'sha256'),'hex');
  SELECT * INTO result FROM public.project_packages
    WHERE project_id=p_project_id AND idempotency_key=p_idempotency_key;
  IF FOUND THEN
    IF result.request_hash<>fingerprint THEN
      RAISE EXCEPTION 'idempotency_key_reused' USING ERRCODE='23505'; END IF;
    RETURN result;
  END IF;
  IF p_package_key IS NOT NULL THEN
    PERFORM public._assert_plan_package_key(p_project_id,p_package_key);
    IF EXISTS (SELECT 1 FROM public.project_packages WHERE project_id=p_project_id AND package_key=p_package_key) THEN
      RAISE EXCEPTION 'package_key_taken' USING ERRCODE='23505'; END IF;
  END IF;
  INSERT INTO public.project_packages(project_id,package_kind,code,title,project_room_id,package_key,
    idempotency_key,request_hash,created_by)
  VALUES(p_project_id,p_kind,p_code,p_title,p_project_room_id,p_package_key,p_idempotency_key,fingerprint,auth.uid())
  RETURNING * INTO result;
  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.create_project_package(uuid,text,text,text,text,uuid,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_project_package(uuid,text,text,text,text,uuid,text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.bind_project_package_key(p_package_id uuid,p_package_key text)
RETURNS public.project_packages LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE result public.project_packages; job uuid;
BEGIN
  SELECT project_id INTO job FROM public.project_packages WHERE id=p_package_id;
  PERFORM 1 FROM public.projects WHERE id=job FOR UPDATE;
  IF NOT public.can_compose_project_plan(job) THEN
    RAISE EXCEPTION 'plan_composition_forbidden' USING ERRCODE='42501'; END IF;
  SELECT * INTO result FROM public.project_packages WHERE id=p_package_id FOR UPDATE;
  IF result.package_key IS NOT NULL THEN
    IF result.package_key IS DISTINCT FROM p_package_key THEN
      RAISE EXCEPTION 'package_key_immutable' USING ERRCODE='23514'; END IF;
    RETURN result;
  END IF;
  PERFORM public._assert_plan_package_key(job,p_package_key);
  IF EXISTS (SELECT 1 FROM public.project_packages WHERE project_id=job AND package_key=p_package_key AND id<>p_package_id) THEN
    RAISE EXCEPTION 'package_key_taken' USING ERRCODE='23505'; END IF;
  UPDATE public.project_packages SET package_key=p_package_key WHERE id=p_package_id RETURNING * INTO result;
  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.bind_project_package_key(uuid,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bind_project_package_key(uuid,text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.set_plan_sheet_rooms(p_sheet_id uuid,p_project_room_ids uuid[])
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE job uuid; ids uuid[];
BEGIN
  SELECT project_id INTO job FROM public.plan_sheets WHERE id=p_sheet_id;
  PERFORM 1 FROM public.projects WHERE id=job FOR KEY SHARE;
  IF NOT public.can_compose_project_plan(job) THEN
    RAISE EXCEPTION 'plan_composition_forbidden' USING ERRCODE='42501'; END IF;
  PERFORM 1 FROM public.plan_sheets WHERE id=p_sheet_id FOR UPDATE;
  SELECT COALESCE(array_agg(DISTINCT id ORDER BY id),'{}'::uuid[]) INTO ids FROM unnest(p_project_room_ids) id;
  PERFORM 1 FROM public.project_rooms WHERE id=ANY(ids) ORDER BY id FOR SHARE;
  IF EXISTS (SELECT 1 FROM unnest(ids) AS requested(id) LEFT JOIN public.project_rooms r ON r.id=requested.id
    WHERE r.id IS NULL OR r.project_id<>job) THEN
    RAISE EXCEPTION 'plan_sheet_link_off_project' USING ERRCODE='23514'; END IF;
  PERFORM 1 FROM public.plan_sheet_rooms WHERE sheet_id=p_sheet_id ORDER BY project_room_id FOR UPDATE;
  DELETE FROM public.plan_sheet_rooms WHERE sheet_id=p_sheet_id AND NOT(project_room_id=ANY(ids));
  INSERT INTO public.plan_sheet_rooms(sheet_id,project_room_id,added_by)
    SELECT p_sheet_id,id,auth.uid() FROM unnest(ids) id ON CONFLICT DO NOTHING;
  RETURN jsonb_build_object('sheetId',p_sheet_id,'roomIds',to_jsonb(ids));
END;
$$;
REVOKE ALL ON FUNCTION public.set_plan_sheet_rooms(uuid,uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_plan_sheet_rooms(uuid,uuid[]) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.set_plan_sheet_packages(p_sheet_id uuid,p_package_ids uuid[])
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE job uuid; ids uuid[];
BEGIN
  SELECT project_id INTO job FROM public.plan_sheets WHERE id=p_sheet_id;
  PERFORM 1 FROM public.projects WHERE id=job FOR KEY SHARE;
  IF NOT public.can_compose_project_plan(job) THEN
    RAISE EXCEPTION 'plan_composition_forbidden' USING ERRCODE='42501'; END IF;
  PERFORM 1 FROM public.plan_sheets WHERE id=p_sheet_id FOR UPDATE;
  SELECT COALESCE(array_agg(DISTINCT id ORDER BY id),'{}'::uuid[]) INTO ids FROM unnest(p_package_ids) id;
  IF EXISTS (SELECT 1 FROM unnest(ids) AS requested(id) LEFT JOIN public.project_packages p ON p.id=requested.id
    WHERE p.id IS NULL OR p.project_id<>job) THEN
    RAISE EXCEPTION 'plan_sheet_link_off_project' USING ERRCODE='23514'; END IF;
  PERFORM 1 FROM public.plan_sheet_packages WHERE sheet_id=p_sheet_id ORDER BY package_id FOR UPDATE;
  DELETE FROM public.plan_sheet_packages WHERE sheet_id=p_sheet_id AND NOT(package_id=ANY(ids));
  INSERT INTO public.plan_sheet_packages(sheet_id,package_id,added_by)
    SELECT p_sheet_id,id,auth.uid() FROM unnest(ids) id ON CONFLICT DO NOTHING;
  RETURN jsonb_build_object('sheetId',p_sheet_id,'packageIds',to_jsonb(ids));
END;
$$;
REVOKE ALL ON FUNCTION public.set_plan_sheet_packages(uuid,uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_plan_sheet_packages(uuid,uuid[]) TO authenticated, service_role;
