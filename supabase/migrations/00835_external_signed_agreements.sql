-- 00835 — Private externally signed design-agreement evidence (US-39).
-- Evidence satisfies only the design-agreement prerequisite, never signatures
-- or financial authority. Recorded provenance and its storage identity are immutable.

CREATE TABLE IF NOT EXISTS public.project_external_agreement_evidence (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  project_id uuid NOT NULL UNIQUE REFERENCES public.projects(id) ON DELETE RESTRICT,
  storage_object_id uuid NOT NULL UNIQUE REFERENCES storage.objects(id) ON DELETE RESTRICT,
  storage_key text NOT NULL UNIQUE,
  signed_on date NOT NULL CHECK (isfinite(signed_on)),
  covers_project boolean NOT NULL CHECK (covers_project IS TRUE),
  attested_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  attested_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.project_external_agreement_evidence ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.project_external_agreement_evidence FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.project_external_agreement_evidence TO authenticated;
DROP POLICY IF EXISTS external_agreement_studio_read ON public.project_external_agreement_evidence;
CREATE POLICY external_agreement_studio_read ON public.project_external_agreement_evidence
  FOR SELECT TO authenticated USING (EXISTS (
    SELECT 1 FROM public.projects p WHERE p.id = project_id
      AND public._can_author_proposal(p.designer_id)
  ));

CREATE OR REPLACE FUNCTION public._guard_external_agreement_evidence()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  RAISE EXCEPTION 'Recorded agreement evidence cannot be changed or deleted'
    USING ERRCODE = 'check_violation';
END;
$$;
REVOKE ALL ON FUNCTION public._guard_external_agreement_evidence() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS immutable_external_agreement ON public.project_external_agreement_evidence;
CREATE TRIGGER immutable_external_agreement BEFORE UPDATE OR DELETE
  ON public.project_external_agreement_evidence FOR EACH ROW
  EXECUTE FUNCTION public._guard_external_agreement_evidence();

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('project-agreements', 'project-agreements', false, 20971520, ARRAY['application/pdf'])
ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = 20971520,
  allowed_mime_types = ARRAY['application/pdf'];

-- Generic bucket policies must not allow a client to make signed PDFs public.
DROP POLICY IF EXISTS project_agreements_bucket_boundary ON storage.buckets;
CREATE POLICY project_agreements_bucket_boundary ON storage.buckets AS RESTRICTIVE
  FOR ALL TO authenticated, anon USING (id <> 'project-agreements')
  WITH CHECK (id <> 'project-agreements');

CREATE OR REPLACE FUNCTION public._can_access_project_agreement_object(p_key text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT auth.uid() IS NOT NULL AND p_key ~
    '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.pdf$'
    AND EXISTS (SELECT 1 FROM public.projects p
      WHERE p.id::text = split_part(p_key, '/', 1)
        AND public._can_author_proposal(p.designer_id));
$$;
REVOKE ALL ON FUNCTION public._can_access_project_agreement_object(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._can_access_project_agreement_object(text) TO authenticated;

-- Restrictive policies are required: unrelated permissive storage policies
-- must never turn this bucket into a shared folio or permit object replacement.
DROP POLICY IF EXISTS project_agreements_anon_boundary ON storage.objects;
CREATE POLICY project_agreements_anon_boundary ON storage.objects AS RESTRICTIVE
  FOR ALL TO anon USING (bucket_id <> 'project-agreements')
  WITH CHECK (bucket_id <> 'project-agreements');
DROP POLICY IF EXISTS project_agreements_read_boundary ON storage.objects;
CREATE POLICY project_agreements_read_boundary ON storage.objects AS RESTRICTIVE
  FOR SELECT TO authenticated USING (bucket_id <> 'project-agreements'
    OR public._can_access_project_agreement_object(name));
DROP POLICY IF EXISTS project_agreements_read ON storage.objects;
CREATE POLICY project_agreements_read ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'project-agreements' AND public._can_access_project_agreement_object(name));
DROP POLICY IF EXISTS project_agreements_insert_boundary ON storage.objects;
CREATE POLICY project_agreements_insert_boundary ON storage.objects AS RESTRICTIVE
  FOR INSERT TO authenticated WITH CHECK (bucket_id <> 'project-agreements' OR (
    public._can_access_project_agreement_object(name) AND owner_id = auth.uid()::text
  ));
DROP POLICY IF EXISTS project_agreements_insert ON storage.objects;
CREATE POLICY project_agreements_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'project-agreements'
    AND public._can_access_project_agreement_object(name) AND owner_id = auth.uid()::text);
DROP POLICY IF EXISTS project_agreements_update_boundary ON storage.objects;
CREATE POLICY project_agreements_update_boundary ON storage.objects AS RESTRICTIVE
  FOR UPDATE TO authenticated USING (bucket_id <> 'project-agreements')
  WITH CHECK (bucket_id <> 'project-agreements');
DROP POLICY IF EXISTS project_agreements_delete_boundary ON storage.objects;
CREATE POLICY project_agreements_delete_boundary ON storage.objects AS RESTRICTIVE
  FOR DELETE TO authenticated USING (bucket_id <> 'project-agreements');

CREATE OR REPLACE FUNCTION public._guard_recorded_agreement_object()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.project_external_agreement_evidence e
      WHERE e.storage_object_id = OLD.id) THEN
    RAISE EXCEPTION 'Recorded agreement PDF cannot be changed or deleted'
      USING ERRCODE = 'check_violation';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public._guard_recorded_agreement_object() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS immutable_recorded_agreement_object ON storage.objects;
CREATE TRIGGER immutable_recorded_agreement_object BEFORE UPDATE OR DELETE ON storage.objects
  FOR EACH ROW EXECUTE FUNCTION public._guard_recorded_agreement_object();

CREATE OR REPLACE FUNCTION public.project_has_design_agreement_eligibility(p_project_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.project_commercial_documents d
    JOIN public.proposals p ON p.id = d.proposal_id
    WHERE d.project_id = p_project_id AND d.is_origin
      AND d.document_kind IN ('design_services', 'design_build')
      AND p.commercial_state = 'executed'
  ) OR (
    NOT EXISTS (SELECT 1 FROM public.project_commercial_documents d
      WHERE d.project_id = p_project_id AND d.is_origin)
    AND NOT EXISTS (SELECT 1 FROM public.project_billing_authorities a WHERE a.project_id = p_project_id)
    AND EXISTS (
      SELECT 1 FROM public.project_external_agreement_evidence e
      JOIN storage.objects o ON o.id = e.storage_object_id
      WHERE e.project_id = p_project_id AND e.covers_project IS TRUE
        AND isfinite(e.signed_on) AND e.signed_on <= CURRENT_DATE
        AND o.bucket_id = 'project-agreements' AND o.name = e.storage_key
        AND split_part(o.name, '/', 1) = p_project_id::text
        AND o.owner_id = e.attested_by::text
        AND o.metadata->>'mimetype' = 'application/pdf'
        AND CASE WHEN o.metadata->>'size' ~ '^[0-9]+$'
          THEN (o.metadata->>'size')::numeric BETWEEN 1 AND 20971520 ELSE false END
    )
  );
$$;
REVOKE ALL ON FUNCTION public.project_has_design_agreement_eligibility(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.record_project_external_agreement_evidence(
  p_project_id uuid, p_storage_key text, p_signed_on date, p_covers_project boolean
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_project public.projects%ROWTYPE;
  v_object storage.objects%ROWTYPE;
  v_evidence public.project_external_agreement_evidence%ROWTYPE;
BEGIN
  SELECT * INTO v_project FROM public.projects WHERE id = p_project_id FOR UPDATE;
  IF auth.uid() IS NULL OR v_project.id IS NULL
    OR NOT public._can_author_proposal(v_project.designer_id) THEN
    RAISE EXCEPTION 'Project not found or access denied' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_covers_project IS DISTINCT FROM true OR p_signed_on IS NULL
    OR NOT isfinite(p_signed_on) OR p_signed_on > CURRENT_DATE THEN
    RAISE EXCEPTION 'Confirm project coverage and provide a valid, nonfuture signed date'
      USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (SELECT 1 FROM public.project_commercial_documents WHERE project_id = p_project_id AND is_origin)
    OR EXISTS (SELECT 1 FROM public.project_billing_authorities WHERE project_id = p_project_id) THEN
    RAISE EXCEPTION 'This project already has a Patina agreement or billing authority; resolve its existing hold instead'
      USING ERRCODE = 'check_violation';
  END IF;
  SELECT * INTO v_evidence FROM public.project_external_agreement_evidence WHERE project_id = p_project_id;
  IF FOUND THEN
    IF v_evidence.storage_key IS DISTINCT FROM p_storage_key OR v_evidence.signed_on IS DISTINCT FROM p_signed_on THEN
      RAISE EXCEPTION 'A signed agreement is already recorded for this project; it cannot be replaced'
        USING ERRCODE = 'check_violation';
    END IF;
  ELSE
    IF p_storage_key IS NULL OR split_part(p_storage_key, '/', 1) <> p_project_id::text
      OR NOT public._can_access_project_agreement_object(p_storage_key) THEN
      RAISE EXCEPTION 'Choose a PDF uploaded for this project' USING ERRCODE = 'check_violation';
    END IF;
    SELECT * INTO v_object FROM storage.objects
      WHERE bucket_id = 'project-agreements' AND name = p_storage_key FOR UPDATE;
    IF v_object.id IS NULL OR v_object.owner_id IS DISTINCT FROM auth.uid()::text
      OR v_object.metadata->>'mimetype' IS DISTINCT FROM 'application/pdf'
      OR NOT (CASE WHEN v_object.metadata->>'size' ~ '^[0-9]+$'
        THEN (v_object.metadata->>'size')::numeric BETWEEN 1 AND 20971520 ELSE false END) THEN
      RAISE EXCEPTION 'The uploaded PDF must belong to you and be at most 20 MiB'
        USING ERRCODE = 'check_violation';
    END IF;
    INSERT INTO public.project_external_agreement_evidence
      (project_id, storage_object_id, storage_key, signed_on, covers_project, attested_by)
    VALUES (p_project_id, v_object.id, p_storage_key, p_signed_on, true, auth.uid())
    RETURNING * INTO v_evidence;
  END IF;
  RETURN jsonb_build_object('id', v_evidence.id, 'project_id', v_evidence.project_id,
    'storage_key', v_evidence.storage_key, 'signed_on', v_evidence.signed_on,
    'attested_by', v_evidence.attested_by, 'attested_at', v_evidence.attested_at);
END;
$$;
REVOKE ALL ON FUNCTION public.record_project_external_agreement_evidence(uuid,text,date,boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_project_external_agreement_evidence(uuid,text,date,boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_project_purchasing_agreement(p_project_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_project public.projects%ROWTYPE;
  v_evidence jsonb;
BEGIN
  SELECT * INTO v_project FROM public.projects WHERE id = p_project_id;
  IF auth.uid() IS NULL OR v_project.id IS NULL
    OR NOT public._can_author_proposal(v_project.designer_id) THEN
    RAISE EXCEPTION 'Project not found or access denied' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF EXISTS (SELECT 1 FROM public.project_commercial_documents d
    JOIN public.proposals p ON p.id = d.proposal_id
    WHERE d.project_id = p_project_id AND d.is_origin
      AND d.document_kind IN ('design_services', 'design_build') AND p.commercial_state = 'executed') THEN
    RETURN jsonb_build_object('state', 'patina_signed', 'evidence', NULL);
  END IF;
  IF public.project_has_design_agreement_eligibility(p_project_id) THEN
    SELECT jsonb_build_object('id', e.id, 'project_id', e.project_id,
      'storage_key', e.storage_key, 'signed_on', e.signed_on,
      'attested_by', e.attested_by, 'attested_at', e.attested_at) INTO v_evidence
    FROM public.project_external_agreement_evidence e WHERE e.project_id = p_project_id;
    RETURN jsonb_build_object('state', 'external_recorded', 'evidence', v_evidence);
  END IF;
  RETURN jsonb_build_object('state', 'missing', 'evidence', NULL);
END;
$$;
REVOKE ALL ON FUNCTION public.get_project_purchasing_agreement(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_project_purchasing_agreement(uuid) TO authenticated;

-- Latest-body grafts: 00744 draft; 00578 digital/paper; 00758 checkpoint.
-- US-39 revision 2: only origin prerequisites and external draft metadata change.

-- Grafted from 00744_pieces_release_placements.sql: _create_furnishings_authorization_from_schedule_00444_impl.
CREATE OR REPLACE FUNCTION public._create_furnishings_authorization_from_schedule_00444_impl(
  p_project_id uuid,
  p_name text,
  p_ffe_item_ids uuid[],
  p_deposit_percent numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_project public.projects%ROWTYPE;
  v_origin public.proposals%ROWTYPE;
  v_checkpoint public.project_budget_checkpoints%ROWTYPE;
  v_proposal_id uuid := extensions.gen_random_uuid();
  v_document_id uuid;
  v_name text := btrim(COALESCE(p_name, ''));
  v_ids uuid[];
  v_line public.project_ffe_items%ROWTYPE;
  v_id uuid;
  v_room_name text;
  v_price bigint;
  v_subtotal bigint := 0;
  v_deposit numeric;
  v_uncovered text;
  v_labor_ids uuid[];
  v_readiness jsonb;
BEGIN
  -- (1) Shape.
  IF v_actor IS NULL OR char_length(v_name) < 2 THEN
    RAISE EXCEPTION 'furnishings release requires an authenticated author and a name'
      USING ERRCODE = 'check_violation';
  END IF;
  IF p_ffe_item_ids IS NULL OR array_position(p_ffe_item_ids, NULL) IS NOT NULL THEN
    RAISE EXCEPTION 'furnishings release requires a non-null list of schedule lines'
      USING ERRCODE = 'check_violation';
  END IF;
  SELECT COALESCE(array_agg(DISTINCT s), '{}'::uuid[]) INTO v_ids
  FROM unnest(p_ffe_item_ids) AS s;
  IF array_length(v_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'furnishings release requires at least one schedule line'
      USING ERRCODE = 'check_violation';
  END IF;
  IF p_deposit_percent IS NOT NULL
     AND (p_deposit_percent < 0 OR p_deposit_percent > 100) THEN
    RAISE EXCEPTION 'furnishings deposit percent must be between 0 and 100'
      USING ERRCODE = 'check_violation';
  END IF;

  -- (2) Project + authoring authority.
  SELECT * INTO v_project FROM public.projects WHERE id = p_project_id FOR SHARE;
  IF NOT FOUND OR NOT public._can_author_proposal(v_project.designer_id) THEN
    RAISE EXCEPTION 'project % not found or access denied', p_project_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- (2b) 00733 (D5): labor is released with its piece. A labor line named
  -- without its piece is refused; every active labor line of a named piece
  -- joins the set. Lines of another project fall through to step (5)'s
  -- refusal unchanged.
  IF EXISTS (
    SELECT 1 FROM public.project_ffe_items labor
    WHERE labor.id = ANY (v_ids)
      AND labor.project_id = p_project_id
      AND labor.line_kind = 'labor'
      AND (labor.parent_ffe_item_id IS NULL
           OR NOT (labor.parent_ffe_item_id = ANY (v_ids)))
  ) THEN
    RAISE EXCEPTION 'Labor is released with its piece.'
      USING ERRCODE = 'check_violation';
  END IF;
  SELECT COALESCE(array_agg(labor.id ORDER BY labor.id), '{}'::uuid[]) INTO v_labor_ids
  FROM public.project_ffe_items labor
  WHERE labor.parent_ffe_item_id = ANY (v_ids)
    AND labor.project_id = p_project_id
    AND labor.line_kind = 'labor'
    AND labor.removed_at IS NULL
    AND NOT (labor.id = ANY (v_ids));
  -- The outer readiness gate (00445:116-121) saw only the named ids.
  FOREACH v_id IN ARRAY v_labor_ids
  LOOP
    v_readiness := public.get_project_ffe_readiness(v_id);
    IF NOT COALESCE((v_readiness->>'ready')::boolean, false) THEN
      RAISE EXCEPTION 'schedule line % is not ready for authorization: %',
        v_id, v_readiness->'missingFields'
        USING ERRCODE = 'check_violation';
    END IF;
  END LOOP;
  SELECT array_agg(DISTINCT s) INTO v_ids
  FROM unnest(v_ids || v_labor_ids) AS s;

  -- (3) Executed design-services origin (00412 shape, byte-for-byte).
  IF NOT public.project_has_design_agreement_eligibility(p_project_id) THEN
    RAISE EXCEPTION 'project % has no executed design-services origin', p_project_id
      USING ERRCODE = 'check_violation';
  END IF;

  -- (4) The latest checkpoint must be settled AND still describe its version.
  -- Verifying the fingerprint here (not only at execution) fails the studio
  -- early, while the instrument is still cheap to abandon.
  SELECT checkpoint.* INTO v_checkpoint
  FROM public.project_budget_checkpoints checkpoint
  JOIN public.project_budget_versions version
    ON version.id = checkpoint.budget_version_id
  WHERE checkpoint.project_id = p_project_id
  ORDER BY version.version DESC, checkpoint.published_at DESC, checkpoint.id DESC
  LIMIT 1 FOR SHARE OF checkpoint;
  IF v_checkpoint.id IS NULL
     OR v_checkpoint.status NOT IN ('acknowledged', 'overridden') THEN
    RAISE EXCEPTION 'latest furnishings checkpoint must be acknowledged or audited override'
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_checkpoint.snapshot_fingerprint IS DISTINCT FROM
     public._budget_version_fingerprint(v_checkpoint.budget_version_id) THEN
    RAISE EXCEPTION 'budget checkpoint no longer matches its published version'
      USING ERRCODE = 'check_violation';
  END IF;

  -- (5) Every named schedule line, locked and proven releasable.
  PERFORM 1 FROM public.project_ffe_items
  WHERE id = ANY (v_ids) ORDER BY id FOR UPDATE;

  FOREACH v_id IN ARRAY v_ids
  LOOP
    SELECT * INTO v_line FROM public.project_ffe_items WHERE id = v_id;
    IF NOT FOUND OR v_line.project_id IS DISTINCT FROM p_project_id THEN
      RAISE EXCEPTION 'schedule line % does not belong to project %', v_id, p_project_id
        USING ERRCODE = 'check_violation';
    END IF;
    -- 00423: a trade presence line is not furniture. It is priced on its own
    -- scope and billed by that scope's draws, so releasing it here would put the
    -- same money on two instruments — and the single-provenance CHECK would only
    -- say so at the client's signature. Refuse it while it is still the studio's
    -- problem, by name, the way the purchase-order sibling does.
    IF v_line.trade_scope_document_id IS NOT NULL THEN
      RAISE EXCEPTION 'schedule line "%" is trade work on its own scope and cannot be released as furnishings',
        v_line.name
        USING ERRCODE = 'check_violation';
    END IF;
    IF v_line.item_type = 'tbd' THEN
      RAISE EXCEPTION 'schedule line % is still TBD; resolve it before releasing', v_id
        USING ERRCODE = 'check_violation';
    END IF;
    -- The allowance snapshot divides the ceiling by quantity, and quantity has
    -- no CHECK on project_ffe_items. A zero would raise a bare 22012 out of the
    -- release; a negative would sign a negative unit price into the snapshot.
    IF COALESCE(v_line.quantity, 0) <= 0 THEN
      RAISE EXCEPTION 'schedule line % has no quantity to authorize', v_id
        USING ERRCODE = 'check_violation';
    END IF;
    IF v_line.item_type = 'fixed' THEN
      IF COALESCE(v_line.unit_price_cents, 0) <= 0 OR v_line.line_total_cents IS NULL THEN
        RAISE EXCEPTION 'fixed schedule line % has no client price to authorize', v_id
          USING ERRCODE = 'check_violation';
      END IF;
    ELSIF v_line.item_type = 'allowance' THEN
      IF COALESCE(v_line.budget_max_cents, 0) <= 0 THEN
        RAISE EXCEPTION 'allowance schedule line % has no ceiling to authorize', v_id
          USING ERRCODE = 'check_violation';
      END IF;
    ELSE
      RAISE EXCEPTION 'schedule line % has unsupported item type %', v_id, v_line.item_type
        USING ERRCODE = 'check_violation';
    END IF;
    -- A roomless line cannot be proven against a room-keyed budget, and the
    -- client's read has nowhere to file it. Distinct message on purpose: the
    -- studio's fix is to file the line, not to change the budget.
    IF v_line.project_room_id IS NULL THEN
      RAISE EXCEPTION 'schedule line % has no room; file it in a room before releasing', v_id
        USING ERRCODE = 'check_violation';
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.furnishing_authorization_items a
      JOIN public.project_commercial_documents d ON d.id = a.commercial_document_id
      JOIN public.proposals p ON p.id = d.proposal_id
      WHERE a.source_ffe_item_id = v_id
        AND COALESCE(p.commercial_state, 'draft') NOT IN ('declined', 'superseded')
    ) THEN
      RAISE EXCEPTION 'schedule line % is already named by a live authorization', v_id
        USING ERRCODE = 'check_violation';
    END IF;
    IF v_line.source_commercial_document_id IS NOT NULL THEN
      RAISE EXCEPTION 'schedule line % is already bound to an executed authorization', v_id
        USING ERRCODE = 'check_violation';
    END IF;

    v_subtotal := v_subtotal + CASE
      WHEN v_line.item_type = 'fixed' THEN v_line.line_total_cents
      ELSE v_line.budget_max_cents END;
  END LOOP;

  -- (6) R6 COVERAGE, HARD. Every room in the release must be a room the client
  -- saw a budget for. There is deliberately NO drift check here: whether the
  -- schedule has outgrown its target is a conversation, not a constraint. That
  -- the room was never budgeted at all is a defect.
  SELECT r.name INTO v_uncovered
  FROM public.project_ffe_items i
  JOIN public.project_rooms r ON r.id = i.project_room_id
  WHERE i.id = ANY (v_ids)
    AND NOT EXISTS (
      SELECT 1 FROM public.project_budget_lines l
      WHERE l.budget_version_id = v_checkpoint.budget_version_id
        AND l.project_room_id = i.project_room_id
    )
  ORDER BY r.name
  LIMIT 1;
  IF v_uncovered IS NOT NULL THEN
    RAISE EXCEPTION 'room "%" is not covered by the acknowledged budget', v_uncovered
      USING ERRCODE = 'check_violation';
  END IF;

  -- (7) Deposit: explicit argument, else the signed agreement's standing term,
  -- else the house default.
  -- LEFT JOIN, not JOIN: an inner join drops an authority with no terms row
  -- BEFORE the ORDER BY/LIMIT, so the answer would silently come from an older
  -- authority instead of the newest one. The newest active authority decides,
  -- and if it names no term the house default does.
  v_deposit := COALESCE(
    p_deposit_percent,
    (SELECT t.furnishings_deposit_percent
     FROM public.project_billing_authorities ba
     LEFT JOIN public.proposal_service_terms t ON t.proposal_id = ba.source_proposal_id
     WHERE ba.project_id = p_project_id AND ba.status = 'active'
     ORDER BY ba.effective_at DESC
     LIMIT 1),
    50
  );

  -- (8) The client-facing edition. Identities come from the executed origin
  -- (00412:1941-1956 shape) — there is no source draft to inherit them from.
  -- NOTE: no proposal_items clone. The schedule IS the line population.
  SELECT origin_proposal.* INTO v_origin
  FROM public.project_commercial_documents origin
  JOIN public.proposals origin_proposal ON origin_proposal.id = origin.proposal_id
  WHERE origin.project_id = p_project_id AND origin.is_origin
    AND origin.document_kind IN ('design_services', 'design_build')
    AND origin_proposal.commercial_state = 'executed'
  LIMIT 1;
  IF v_origin.id IS NULL THEN
    SELECT relationship.id INTO v_origin.designer_client_id
    FROM public.designer_clients relationship
    WHERE relationship.designer_id = v_project.designer_id
      AND relationship.client_id = v_project.client_id;
    IF v_origin.designer_client_id IS NULL THEN
      RAISE EXCEPTION 'The project needs its studio-client relationship before purchasing authorization'
        USING ERRCODE = 'check_violation';
    END IF;
    v_origin.project_address := v_project.site_address;
    v_origin.feedback_enabled := true;
  END IF;

  INSERT INTO public.proposals (
    id, designer_id, client_id, designer_client_id, title, description,
    subtotal, discount_amount, discount_percent, tax_rate, tax_amount,
    total_amount, deposit_percent, status, version, project_address,
    client_visibility_tier, feedback_enabled, document_kind, commercial_state
  ) VALUES (
    v_proposal_id, v_project.designer_id, v_project.client_id,
    v_origin.designer_client_id, v_name,
    'Furnishings released from the project schedule.',
    public._cents_to_int4(v_subtotal, 'this release'), 0, 0, 0, 0,
    public._cents_to_int4(v_subtotal, 'this release'), v_deposit, 'draft', 1,
    v_origin.project_address, 'full', v_origin.feedback_enabled,
    'furnishings_authorization', 'draft'
  );

  -- (9) Bind it to the project and the checkpoint it was proven against.
  INSERT INTO public.project_commercial_documents (
    project_id, proposal_id, document_kind, wave_name, budget_checkpoint_id,
    created_by
  ) VALUES (
    p_project_id, v_proposal_id, 'furnishings_authorization', v_name,
    v_checkpoint.id, v_actor
  ) RETURNING id INTO v_document_id;

  -- (10) Freeze each line. An allowance is authorized at its CEILING: the
  -- client signs for "up to this much", and the per-unit figure is that ceiling
  -- divided by quantity. Integer division truncates, so for quantity > 1 the
  -- unit price can round down by up to (quantity - 1) cents against the
  -- ceiling — deliberate: client_line_total_cents is the authoritative ceiling
  -- and the guard compares totals, never quantity × unit.
  FOREACH v_id IN ARRAY v_ids
  LOOP
    SELECT * INTO v_line FROM public.project_ffe_items WHERE id = v_id;
    SELECT r.name INTO v_room_name FROM public.project_rooms r
    WHERE r.id = v_line.project_room_id;
    v_price := CASE WHEN v_line.item_type = 'fixed'
      THEN v_line.line_total_cents ELSE v_line.budget_max_cents END;

    INSERT INTO public.furnishing_authorization_items (
      commercial_document_id, source_proposal_item_id, source_ffe_item_id,
      project_room_id, product_id, name, room_name, category, item_type,
      quantity, client_unit_price_cents, client_line_total_cents,
      trade_unit_cost_cents, markup_percent, vendor_id, vendor_name,
      snapshot, sort_order
    ) VALUES (
      v_document_id, NULL, v_line.id, v_line.project_room_id, v_line.product_id,
      v_line.name, v_room_name, COALESCE(v_line.ffe_category, 'Uncategorized'),
      v_line.item_type, v_line.quantity,
      CASE WHEN v_line.item_type = 'fixed' THEN v_line.unit_price_cents
           ELSE (v_line.budget_max_cents / v_line.quantity)::integer END,
      v_price::integer,
      v_line.trade_price_cents, v_line.markup_percent, v_line.vendor_id,
      v_line.vendor_name,
      -- 00744 (D7 phase 2): one row per line, whatever its rooms. room_name
      -- above stays the primary; the snapshot names every room and its share.
      public._furnishing_authorization_item_snapshot(v_line),
      v_line.sort_order
    );
  END LOOP;

  -- No GUC save/restore here on purpose: unlike the send/execute/void rails,
  -- this body sets no transaction-local capability. Every write it makes is
  -- authorized by being SECURITY DEFINER (the ledger guard's postgres check);
  -- an exception handler that restores a setting nothing set would read as
  -- load-bearing and is not.
  RETURN jsonb_build_object(
    'proposalId', v_proposal_id,
    'documentId', v_document_id,
    'projectId', p_project_id,
    'waveName', v_name,
    'commercialState', 'draft',
    'budgetCheckpointId', v_checkpoint.id,
    'itemCount', array_length(v_ids, 1),
    'documentFingerprint', public._commercial_document_fingerprint(v_proposal_id)
  );
END;
$$;

-- Grafted from 00578_design_build_kind.sql: _execute_furnishings_authorization_authorized.
CREATE OR REPLACE FUNCTION public._execute_furnishings_authorization_authorized(
  p_proposal_id uuid,
  p_signed_name text,
  p_client_id uuid,
  p_trusted_signed_ip text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_actor uuid := p_client_id;
  v_proposal public.proposals%ROWTYPE;
  v_document public.project_commercial_documents%ROWTYPE;
  v_project public.projects%ROWTYPE;
  v_signature public.commercial_document_signatures%ROWTYPE;
  v_name text := btrim(COALESCE(p_signed_name, ''));
  v_fingerprint text;
  v_deposit_cents integer;
  v_deposit_invoice_id uuid;
  v_applied_ids uuid[] := '{}'::uuid[];
  v_linked_ids uuid[] := '{}'::uuid[];
  v_newly boolean := false;
  v_previous_accept text :=
    current_setting('app.proposal_accept_id', true);
  v_previous_commercial text :=
    current_setting('app.commercial_document_id', true);
  v_anchor_phase_id uuid;
  -- plpgsql forbids a row variable in a multi-item INTO list, so the paired
  -- composites land in one record and are unpacked below.
  v_row_5356 record;
BEGIN
  IF v_actor IS NULL OR char_length(v_name) < 2 THEN
    RAISE EXCEPTION
      'furnishings execution requires an authenticated client and legal name'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_proposal
  FROM public.proposals
  WHERE id = p_proposal_id
    AND client_id = v_actor
    AND document_kind = 'furnishings_authorization';
  IF NOT FOUND THEN
    RAISE EXCEPTION
      'furnishings authorization % not found or access denied', p_proposal_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT document, project INTO v_row_5356
  FROM public.project_commercial_documents AS document
  JOIN public.projects AS project ON project.id = document.project_id
  WHERE document.proposal_id = p_proposal_id
    AND document.document_kind = 'furnishings_authorization'
    AND project.client_id = v_actor
    AND project.status = 'active'
    AND (
      v_proposal.project_id IS NULL
      OR v_proposal.project_id = project.id
    );
  IF NOT FOUND THEN
    RAISE EXCEPTION
      'furnishings authorization % not found or access denied', p_proposal_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  v_document := v_row_5356.document;
  v_project := v_row_5356.project;

  SELECT project.* INTO v_project
  FROM public.projects AS project
  WHERE project.id = v_document.project_id
    AND project.client_id = v_actor
    AND project.designer_id = v_project.designer_id
    AND project.studio_id = v_project.studio_id
    AND project.status = 'active'
  FOR UPDATE;

  PERFORM role.id
  FROM public.roles AS role
  WHERE role.domain = 'designer'
  ORDER BY role.id
  FOR SHARE;

  PERFORM user_role.id
  FROM public.user_roles AS user_role
  JOIN public.roles AS role ON role.id = user_role.role_id
  WHERE user_role.user_id = v_project.designer_id
    AND role.domain = 'designer'
  ORDER BY user_role.role_id, user_role.id
  FOR SHARE OF user_role;
  IF NOT FOUND THEN
    RAISE EXCEPTION
      'furnishings authorization % not found or access denied', p_proposal_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  PERFORM lead_membership.id
  FROM public.organization_members AS lead_membership
  WHERE lead_membership.organization_id = v_project.studio_id
    AND lead_membership.user_id = v_project.designer_id
  ORDER BY lead_membership.id
  FOR SHARE;

  PERFORM studio.id
  FROM public.organizations AS studio
  WHERE studio.id = v_project.studio_id
  ORDER BY studio.id
  FOR SHARE;

  IF NOT EXISTS (
       SELECT 1 FROM public.organizations AS studio
       WHERE studio.id = v_project.studio_id
         AND studio.type = 'design_studio'
         AND studio.status = 'active'
     )
     OR NOT EXISTS (
       SELECT 1 FROM public.organization_members AS lead_membership
       WHERE lead_membership.organization_id = v_project.studio_id
         AND lead_membership.user_id = v_project.designer_id
         AND lead_membership.status = 'active'
         AND lead_membership.role <> 'guest'
     )
  THEN
    RAISE EXCEPTION
      'furnishings authorization % not found or access denied', p_proposal_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT proposal.* INTO v_proposal
  FROM public.proposals AS proposal
  WHERE proposal.id = p_proposal_id
    AND proposal.client_id = v_actor
    AND proposal.document_kind = 'furnishings_authorization'
    AND (proposal.project_id IS NULL OR proposal.project_id = v_project.id)
  FOR UPDATE;

  SELECT document.* INTO v_document
  FROM public.project_commercial_documents AS document
  WHERE document.id = v_document.id
    AND document.proposal_id = v_proposal.id
    AND document.project_id = v_project.id
    AND document.document_kind = 'furnishings_authorization'
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION
      'furnishings authorization % not found or access denied', p_proposal_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_proposal.commercial_state <> 'executed'
     AND v_proposal.valid_until IS NOT NULL
     AND v_proposal.valid_until < now()
  THEN
    RAISE EXCEPTION 'furnishings authorization % has expired', p_proposal_id
      USING ERRCODE = 'check_violation';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.project_budget_checkpoints AS checkpoint
    WHERE checkpoint.id = v_document.budget_checkpoint_id
      AND checkpoint.project_id = v_document.project_id
      AND checkpoint.status IN ('acknowledged', 'overridden')
      AND checkpoint.snapshot_fingerprint =
            public._budget_version_fingerprint(checkpoint.budget_version_id)
  ) THEN
    RAISE EXCEPTION
      'furnishings authorization checkpoint is missing or invalid'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NOT public.project_has_design_agreement_eligibility(v_document.project_id) THEN
    RAISE EXCEPTION 'project % has no executed design-services origin',
      v_document.project_id
      USING ERRCODE = 'check_violation';
  END IF;

  v_fingerprint := public._commercial_document_fingerprint(p_proposal_id);
  v_deposit_cents := round(
    COALESCE(v_proposal.total_amount, 0)::numeric
    * COALESCE(v_proposal.deposit_percent, 0)::numeric / 100
  )::integer;

  SELECT * INTO v_signature
  FROM public.commercial_document_signatures
  WHERE proposal_id = p_proposal_id
    AND party_role = 'client'
  FOR UPDATE;

  IF v_proposal.commercial_state = 'executed' THEN
    IF v_signature.id IS NULL
       OR v_signature.signer_user_id IS DISTINCT FROM v_actor
       OR v_signature.signed_name IS DISTINCT FROM v_name
       OR v_signature.evidence_fingerprint IS DISTINCT FROM v_fingerprint
    THEN
      RAISE EXCEPTION
        'furnishings signature retry conflicts with immutable evidence'
        USING ERRCODE = 'check_violation';
    END IF;

    SELECT COALESCE(array_agg(item.id ORDER BY item.id), '{}'::uuid[])
    INTO v_applied_ids
    FROM public.project_ffe_items AS item
    WHERE item.source_commercial_document_id = v_document.id;
  ELSIF v_proposal.commercial_state = 'sent' THEN
    IF v_signature.id IS NOT NULL THEN
      RAISE EXCEPTION
        'furnishings signature topology conflicts with document state'
        USING ERRCODE = 'check_violation';
    END IF;

    INSERT INTO public.commercial_document_signatures (
      proposal_id, party_role, signer_user_id, signed_name, signed_ip,
      evidence_fingerprint, metadata
    ) VALUES (
      p_proposal_id, 'client', v_actor, v_name,
      NULLIF(btrim(COALESCE(p_trusted_signed_ip, '')), ''), v_fingerprint,
      jsonb_build_object('via', 'execute_furnishings_authorization')
    )
    RETURNING * INTO v_signature;

    PERFORM set_config('app.proposal_accept_id', p_proposal_id::text, true);
    PERFORM set_config(
      'app.commercial_document_id', p_proposal_id::text, true
    );

    UPDATE public.proposals
    SET status = 'accepted',
        commercial_state = 'executed',
        signed_at = v_signature.signed_at,
        signed_by_name = v_name,
        accepted_at = v_signature.signed_at,
        updated_at = now()
    WHERE id = p_proposal_id;

    WITH inserted AS (
      INSERT INTO public.project_ffe_items (
        project_id, source_proposal_item_id, product_id, name, ffe_category,
        item_type, status, quantity, unit_price_cents, trade_price_cents,
        markup_percent, line_total_cents, vendor_id, vendor_name, sort_order,
        source_commercial_document_id, source_authorization_item_id,
        custom_fields
      )
      SELECT
        v_document.project_id, item.source_proposal_item_id, item.product_id,
        item.name, item.category, item.item_type, 'approved', item.quantity,
        item.client_unit_price_cents, item.trade_unit_cost_cents,
        item.markup_percent, item.client_line_total_cents, item.vendor_id,
        item.vendor_name, item.sort_order, v_document.id, item.id,
        COALESCE(item.snapshot->'customFields', '{}'::jsonb)
      FROM public.furnishing_authorization_items AS item
      WHERE item.commercial_document_id = v_document.id
        AND item.source_proposal_item_id IS NOT NULL
      ORDER BY item.sort_order, item.id
      RETURNING id
    )
    SELECT COALESCE(array_agg(id ORDER BY id), '{}'::uuid[])
    INTO v_applied_ids
    FROM inserted;

    WITH linked AS (
      UPDATE public.project_ffe_items AS project_item
      SET source_commercial_document_id = v_document.id,
          source_authorization_item_id = item.id,
          status = CASE
            WHEN public.ffe_status_rank(project_item.status) <
                 public.ffe_status_rank('approved')
              THEN 'approved'
            ELSE project_item.status
          END,
          updated_at = now()
      FROM public.furnishing_authorization_items AS item
      WHERE item.commercial_document_id = v_document.id
        AND item.source_ffe_item_id IS NOT NULL
        AND project_item.id = item.source_ffe_item_id
      RETURNING project_item.id
    )
    SELECT COALESCE(array_agg(id ORDER BY id), '{}'::uuid[])
    INTO v_linked_ids
    FROM linked;

    SELECT COALESCE(array_agg(applied ORDER BY applied), '{}'::uuid[])
    INTO v_applied_ids
    FROM unnest(v_applied_ids || v_linked_ids) AS applied;

    IF v_deposit_cents > 0 THEN
      INSERT INTO public.invoices (
        project_id, designer_id, client_id, status, currency,
        subtotal_cents, tax_rate, tax_cents, total_cents, memo
      ) VALUES (
        v_document.project_id, v_project.designer_id, v_proposal.client_id,
        'draft', 'USD', v_deposit_cents, 0, 0, v_deposit_cents,
        'Furnishings deposit · ' || v_document.wave_name
      )
      RETURNING id INTO v_deposit_invoice_id;

      INSERT INTO public.invoice_line_items (
        invoice_id, kind, description, quantity, unit_amount_cents,
        amount_cents, metadata
      ) VALUES (
        v_deposit_invoice_id, 'adhoc',
        'Furnishings authorization deposit', 1,
        v_deposit_cents, v_deposit_cents,
        jsonb_build_object(
          'commercialDocumentId', v_document.id,
          'kind', 'furnishings_deposit'
        )
      );

      PERFORM app_private.issue_invoice_for_actor(
        v_deposit_invoice_id, current_date, v_actor
      );
    END IF;

    UPDATE public.project_commercial_documents
    SET executed_at = v_signature.signed_at,
        deposit_invoice_id = v_deposit_invoice_id
    WHERE id = v_document.id;

    v_anchor_phase_id := public._schedule_thread_phase(v_document.project_id);
    IF v_anchor_phase_id IS NOT NULL THEN
      PERFORM public._commit_schedule_edit_authorized(
        v_document.project_id,
        jsonb_build_array(jsonb_build_object(
          'kind', 'phase-anchor',
          'phase_id', v_anchor_phase_id,
          'anchor_date', to_char(v_signature.signed_at::date, 'YYYY-MM-DD'),
          'source_ref', p_proposal_id
        )),
        'Furnishings authorization executed',
        NULL,
        'ceremony:furnishings-authorization-executed'
      );
    END IF;

    PERFORM set_config(
      'app.proposal_accept_id', COALESCE(v_previous_accept, ''), true
    );
    PERFORM set_config(
      'app.commercial_document_id', COALESCE(v_previous_commercial, ''), true
    );
    v_newly := true;
  ELSE
    RAISE EXCEPTION 'furnishings authorization % is not executable from %',
      p_proposal_id, COALESCE(v_proposal.commercial_state, 'NULL')
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN jsonb_build_object(
    'projectId', v_document.project_id,
    'documentId', v_document.id,
    'checkpointId', v_document.budget_checkpoint_id,
    'appliedItemIds', to_jsonb(v_applied_ids),
    'depositInvoiceId',
      COALESCE(v_deposit_invoice_id, v_document.deposit_invoice_id),
    'depositRequiredCents', COALESCE((
      SELECT invoice.total_cents
      FROM public.invoices AS invoice
      WHERE invoice.id =
            COALESCE(v_deposit_invoice_id, v_document.deposit_invoice_id)
    ), v_deposit_cents),
    'deposit_required_cents', COALESCE((
      SELECT invoice.total_cents
      FROM public.invoices AS invoice
      WHERE invoice.id =
            COALESCE(v_deposit_invoice_id, v_document.deposit_invoice_id)
    ), v_deposit_cents),
    'depositPaidCents', COALESCE((
      SELECT invoice.amount_paid_cents
      FROM public.invoices AS invoice
      WHERE invoice.id =
            COALESCE(v_deposit_invoice_id, v_document.deposit_invoice_id)
    ), 0),
    'deposit_paid_cents', COALESCE((
      SELECT invoice.amount_paid_cents
      FROM public.invoices AS invoice
      WHERE invoice.id =
            COALESCE(v_deposit_invoice_id, v_document.deposit_invoice_id)
    ), 0),
    'newlyExecuted', v_newly
  );
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config(
    'app.proposal_accept_id', COALESCE(v_previous_accept, ''), true
  );
  PERFORM set_config(
    'app.commercial_document_id', COALESCE(v_previous_commercial, ''), true
  );
  RAISE;
END;
$$;

-- Grafted from 00578_design_build_kind.sql: _execute_furnishings_authorization_on_paper_authorized.
CREATE OR REPLACE FUNCTION public._execute_furnishings_authorization_on_paper_authorized(
  p_proposal_id uuid,
  p_signed_name text,
  p_paper_signed_on date,
  p_recorded_by uuid,
  p_scan_document_id uuid DEFAULT NULL,
  p_disclosed_impact jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  -- 00425 DELTA 1 (actor). v_actor is the SIGNER everywhere below, and the
  -- signer is still the client — they are the one who signed, on paper. It is
  -- resolved from the row rather than passed in, because the caller is the
  -- studio. v_recorder is who is doing the recording.
  v_actor uuid;
  v_recorder uuid := p_recorded_by;
  v_proposal public.proposals%ROWTYPE;
  v_document public.project_commercial_documents%ROWTYPE;
  v_project public.projects%ROWTYPE;
  v_signature public.commercial_document_signatures%ROWTYPE;
  v_name text := btrim(COALESCE(p_signed_name, ''));
  v_fingerprint text;
  v_deposit_cents integer;
  v_deposit_invoice_id uuid;
  v_applied_ids uuid[] := '{}'::uuid[];
  v_linked_ids uuid[] := '{}'::uuid[];
  v_newly boolean := false;
  v_previous_accept text := current_setting('app.proposal_accept_id', true);
  v_previous_commercial text := current_setting('app.commercial_document_id', true);
  v_anchor_phase_id uuid;   -- 00475
  -- plpgsql forbids a row variable in a multi-item INTO list, so the paired
  -- composites land in one record and are unpacked below.
  v_row_4630 record;
BEGIN
  IF v_recorder IS NULL OR char_length(v_name) < 2 THEN
    RAISE EXCEPTION 'recording a paper furnishings execution requires an authenticated studio author and legal name'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT proposal, document, project
  INTO v_row_4630
  FROM public.proposals AS proposal
  JOIN public.project_commercial_documents AS document
    ON document.proposal_id = proposal.id
   AND document.document_kind = 'furnishings_authorization'
  JOIN public.projects AS project ON project.id = document.project_id
  JOIN public.designer_clients AS relationship
    ON relationship.id = proposal.designer_client_id
  JOIN public.organizations AS studio ON studio.id = project.studio_id
  JOIN public.organization_members AS recorder_membership
    ON recorder_membership.organization_id = project.studio_id
   AND recorder_membership.user_id = v_recorder
  JOIN public.organization_members AS lead_membership
    ON lead_membership.organization_id = project.studio_id
   AND lead_membership.user_id = project.designer_id
  WHERE proposal.id = p_proposal_id
    AND proposal.client_id IS NOT NULL
    AND proposal.document_kind = 'furnishings_authorization'
    AND (proposal.project_id IS NULL OR proposal.project_id = project.id)
    AND relationship.designer_id = proposal.designer_id
    AND relationship.client_id = proposal.client_id
    AND project.client_id = proposal.client_id
    AND project.status = 'active'
    AND studio.type = 'design_studio'
    AND studio.status = 'active'
    AND recorder_membership.status = 'active'
    AND recorder_membership.role <> 'guest'
    AND lead_membership.status = 'active'
    AND lead_membership.role <> 'guest';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'furnishings authorization % not found or access denied', p_proposal_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  v_proposal := v_row_4630.proposal;
  v_document := v_row_4630.document;
  v_project := v_row_4630.project;

  SELECT project.* INTO v_project
  FROM public.projects AS project
  WHERE project.id = v_document.project_id
    AND project.client_id = v_proposal.client_id
    AND project.designer_id = v_project.designer_id
    AND project.studio_id = v_project.studio_id
    AND project.status = 'active'
  FOR UPDATE;

  PERFORM role.id
  FROM public.roles AS role
  WHERE role.domain = 'designer'
  ORDER BY role.id
  FOR SHARE;

  PERFORM user_role.id
  FROM public.user_roles AS user_role
  JOIN public.roles AS role ON role.id = user_role.role_id
  WHERE user_role.user_id = v_project.designer_id
    AND role.domain = 'designer'
  ORDER BY user_role.role_id, user_role.id
  FOR SHARE OF user_role;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'furnishings authorization % not found or access denied', p_proposal_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  PERFORM membership.id
  FROM public.organization_members AS membership
  WHERE membership.organization_id = v_project.studio_id
    AND membership.user_id = ANY(ARRAY[
      v_project.designer_id, v_recorder
    ]::uuid[])
  ORDER BY membership.user_id, membership.id
  FOR SHARE;

  PERFORM studio.id
  FROM public.organizations AS studio
  WHERE studio.id = v_project.studio_id
  ORDER BY studio.id
  FOR SHARE;

  IF NOT EXISTS (
       SELECT 1 FROM public.organizations AS studio
       WHERE studio.id = v_project.studio_id
         AND studio.type = 'design_studio'
         AND studio.status = 'active'
     )
     OR NOT EXISTS (
       SELECT 1 FROM public.organization_members AS membership
       WHERE membership.organization_id = v_project.studio_id
         AND membership.user_id = v_project.designer_id
         AND membership.status = 'active'
         AND membership.role <> 'guest'
     )
     OR NOT EXISTS (
       SELECT 1 FROM public.organization_members AS membership
       WHERE membership.organization_id = v_project.studio_id
         AND membership.user_id = v_recorder
         AND membership.status = 'active'
         AND membership.role <> 'guest'
     )
  THEN
    RAISE EXCEPTION 'furnishings authorization % not found or access denied', p_proposal_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT proposal.* INTO v_proposal
  FROM public.proposals AS proposal
  WHERE proposal.id = p_proposal_id
    AND proposal.document_kind = 'furnishings_authorization'
    AND proposal.client_id = v_project.client_id
    AND (proposal.project_id IS NULL OR proposal.project_id = v_project.id)
  FOR UPDATE;

  SELECT document.* INTO v_document
  FROM public.project_commercial_documents AS document
  WHERE document.id = v_document.id
    AND document.proposal_id = v_proposal.id
    AND document.project_id = v_project.id
    AND document.document_kind = 'furnishings_authorization'
  FOR UPDATE;

  PERFORM relationship.id
  FROM public.designer_clients AS relationship
  WHERE relationship.id = v_proposal.designer_client_id
    AND relationship.designer_id = v_proposal.designer_id
    AND relationship.client_id = v_proposal.client_id
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'furnishings authorization % not found or access denied', p_proposal_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  v_actor := v_proposal.client_id;
  -- 00425 DELTA 4 (expiry). The client rail refuses an expired authorization
  -- here, because in the portal the link IS the offer. The paper rail does not:
  -- the client already signed, on the date the record carries, and a lapsed
  -- link is not a reason to throw that away. record_paper_client_signature and
  -- record_offline_signature (00399) have never had this guard either.
  IF NOT EXISTS (
    SELECT 1 FROM public.project_budget_checkpoints c
    WHERE c.id = v_document.budget_checkpoint_id
      AND c.project_id = v_document.project_id
      AND c.status IN ('acknowledged', 'overridden')
      AND c.snapshot_fingerprint = public._budget_version_fingerprint(c.budget_version_id)
  ) THEN
    RAISE EXCEPTION 'furnishings authorization checkpoint is missing or invalid'
      USING ERRCODE = 'check_violation';
  END IF;
  -- 00414: defense in depth. create_furnishings_authorization proved the
  -- executed design-services origin when the wave was minted; re-assert it at
  -- the moment authority is actually exercised, so a wave in flight cannot
  -- outlive the origin that authorized it. Applies to the executed retry too:
  -- the retry path re-derives applied item ids and must not answer for a
  -- project whose origin has been unbound.
  IF NOT public.project_has_design_agreement_eligibility(v_document.project_id) THEN
    RAISE EXCEPTION 'project % has no executed design-services origin', v_document.project_id
      USING ERRCODE = 'check_violation';
  END IF;
  v_fingerprint := public._commercial_document_fingerprint(p_proposal_id);
  v_deposit_cents := round(
    COALESCE(v_proposal.total_amount, 0)::numeric
    * COALESCE(v_proposal.deposit_percent, 0)::numeric / 100
  )::integer;
  SELECT * INTO v_signature FROM public.commercial_document_signatures
  WHERE proposal_id = p_proposal_id AND party_role = 'client' FOR UPDATE;

  IF v_proposal.commercial_state = 'executed' THEN
    IF v_signature.id IS NULL OR v_signature.signer_user_id IS DISTINCT FROM v_actor
       OR v_signature.signed_name IS DISTINCT FROM v_name
       OR v_signature.evidence_fingerprint IS DISTINCT FROM v_fingerprint
    THEN
      RAISE EXCEPTION 'furnishings signature retry conflicts with immutable evidence'
        USING ERRCODE = 'check_violation';
    END IF;
    SELECT COALESCE(array_agg(i.id ORDER BY i.id), '{}'::uuid[]) INTO v_applied_ids
    FROM public.project_ffe_items i
    WHERE i.source_commercial_document_id = v_document.id;
  ELSIF v_proposal.commercial_state = 'sent' THEN
    IF v_signature.id IS NOT NULL THEN
      RAISE EXCEPTION 'furnishings signature topology conflicts with document state'
        USING ERRCODE = 'check_violation';
    END IF;
    INSERT INTO public.commercial_document_signatures (
      proposal_id, party_role, signer_user_id, signed_name, signed_ip,
      evidence_fingerprint, metadata
    ) VALUES (
      p_proposal_id, 'client', v_actor, v_name,
      -- 00425 DELTA 2 (signed_ip) and DELTA 3 (metadata). No IP, because no
      -- browser: the paper tell. The metadata builder validates the paper date
      -- and the scan pointer before it returns.
      NULL, v_fingerprint,
      public._paper_signature_metadata(
        p_proposal_id, 'execute_furnishings_authorization_on_paper',
        p_paper_signed_on, v_recorder, p_scan_document_id
      )
    ) RETURNING * INTO v_signature;

    PERFORM set_config('app.proposal_accept_id', p_proposal_id::text, true);
    PERFORM set_config('app.commercial_document_id', p_proposal_id::text, true);
    -- 00414: signed_ip is NOT mirrored onto proposals. The column grant on
    -- commercial_document_signatures takes the signing IP away from studio
    -- readers; mirroring it onto public.proposals — which stays fully
    -- SELECT-granted to authenticated and row-visible to every design-studio
    -- co-member (00401 proposals_design_studio_select) — would hand the same
    -- value back one table over. The signature row is the evidence of record.
    UPDATE public.proposals SET
      status = 'accepted', commercial_state = 'executed',
      signed_at = v_signature.signed_at, signed_by_name = v_name,
      accepted_at = v_signature.signed_at, updated_at = now()
    WHERE id = p_proposal_id;

    -- (a) Legacy provenance: a proposal-sourced snapshot still MINTS its line.
    WITH inserted AS (
      INSERT INTO public.project_ffe_items (
        project_id, source_proposal_item_id, product_id, name, ffe_category,
        item_type, status, quantity, unit_price_cents, trade_price_cents,
        markup_percent, line_total_cents, vendor_id, vendor_name, sort_order,
        source_commercial_document_id, source_authorization_item_id, custom_fields
      ) SELECT
        v_document.project_id, a.source_proposal_item_id, a.product_id, a.name,
        a.category, a.item_type, 'approved', a.quantity,
        a.client_unit_price_cents, a.trade_unit_cost_cents, a.markup_percent,
        a.client_line_total_cents, a.vendor_id, a.vendor_name, a.sort_order,
        v_document.id, a.id, COALESCE(a.snapshot->'customFields', '{}'::jsonb)
      FROM public.furnishing_authorization_items a
      WHERE a.commercial_document_id = v_document.id
        AND a.source_proposal_item_id IS NOT NULL
      ORDER BY a.sort_order, a.id
      RETURNING id
    ) SELECT COALESCE(array_agg(id ORDER BY id), '{}'::uuid[]) INTO v_applied_ids
      FROM inserted;

    -- (b) 00422 provenance: a schedule-sourced snapshot LINKS the line it froze.
    -- The status ratchet uses the 00184 rank helper so a line already further
    -- along (ordered, shipped…) is never dragged back to 'approved'.
    WITH linked AS (
      UPDATE public.project_ffe_items i SET
        source_commercial_document_id = v_document.id,
        source_authorization_item_id = a.id,
        status = CASE
          WHEN public.ffe_status_rank(i.status) < public.ffe_status_rank('approved')
            THEN 'approved' ELSE i.status END,
        updated_at = now()
      FROM public.furnishing_authorization_items a
      WHERE a.commercial_document_id = v_document.id
        AND a.source_ffe_item_id IS NOT NULL
        AND i.id = a.source_ffe_item_id
      RETURNING i.id
    ) SELECT COALESCE(array_agg(id ORDER BY id), '{}'::uuid[]) INTO v_linked_ids
      FROM linked;
    -- Sorted, not concatenated: the executed-retry branch above re-derives this
    -- list with array_agg(... ORDER BY i.id), so a caller comparing a first
    -- execution against its own retry must see the same order, not two
    -- provenance groups in insertion order.
    SELECT COALESCE(array_agg(applied ORDER BY applied), '{}'::uuid[])
    INTO v_applied_ids
    FROM unnest(v_applied_ids || v_linked_ids) AS applied;

    IF v_deposit_cents > 0 THEN
      INSERT INTO public.invoices (
        project_id, designer_id, client_id, status, currency,
        subtotal_cents, tax_rate, tax_cents, total_cents, memo
      ) VALUES (
        v_document.project_id, v_project.designer_id, v_proposal.client_id,
        'draft', 'USD', v_deposit_cents, 0, 0, v_deposit_cents,
        'Furnishings deposit · ' || v_document.wave_name
      ) RETURNING id INTO v_deposit_invoice_id;
      INSERT INTO public.invoice_line_items (
        invoice_id, kind, description, quantity, unit_amount_cents,
        amount_cents, metadata
      ) VALUES (
        v_deposit_invoice_id, 'adhoc', 'Furnishings authorization deposit', 1,
        v_deposit_cents, v_deposit_cents,
        jsonb_build_object('commercialDocumentId', v_document.id, 'kind', 'furnishings_deposit')
      );
      PERFORM app_private.issue_invoice_for_actor(
        v_deposit_invoice_id, current_date, v_recorder
      );
    END IF;
    UPDATE public.project_commercial_documents SET
      executed_at = v_signature.signed_at,
      deposit_invoice_id = v_deposit_invoice_id
    WHERE id = v_document.id;

    -- 00475 (R109 ceremony class): the studio records this act, so the sheet
    -- states the impact and the anchor hardens. The date is the day the client
    -- signed the paper original, not the day it was recorded. A NULL impact
    -- still downgrades to a proposal (R110).
    v_anchor_phase_id := public._schedule_thread_phase(v_document.project_id);
    IF v_anchor_phase_id IS NOT NULL THEN
      PERFORM public._commit_schedule_edit_authorized(
        v_document.project_id,
        jsonb_build_array(jsonb_build_object(
          'kind', 'phase-anchor',
          'phase_id', v_anchor_phase_id,
          'anchor_date', to_char(
            COALESCE(p_paper_signed_on, v_signature.signed_at::date), 'YYYY-MM-DD'),
          'source_ref', p_proposal_id
        )),
        'Furnishings authorization executed',
        p_disclosed_impact,
        'ceremony:furnishings-authorization-executed'
      );
    END IF;

    PERFORM set_config('app.proposal_accept_id', COALESCE(v_previous_accept, ''), true);
    PERFORM set_config('app.commercial_document_id', COALESCE(v_previous_commercial, ''), true);
    v_newly := true;
  ELSE
    RAISE EXCEPTION 'furnishings authorization % is not executable from %',
      p_proposal_id, COALESCE(v_proposal.commercial_state, 'NULL')
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN jsonb_build_object(
    'projectId', v_document.project_id,
    'documentId', v_document.id,
    'checkpointId', v_document.budget_checkpoint_id,
    'appliedItemIds', to_jsonb(v_applied_ids),
    'depositInvoiceId', COALESCE(v_deposit_invoice_id, v_document.deposit_invoice_id),
    'depositRequiredCents', COALESCE((SELECT i.total_cents
      FROM public.invoices i
      WHERE i.id = COALESCE(v_deposit_invoice_id, v_document.deposit_invoice_id)), v_deposit_cents),
    'deposit_required_cents', COALESCE((SELECT i.total_cents
      FROM public.invoices i
      WHERE i.id = COALESCE(v_deposit_invoice_id, v_document.deposit_invoice_id)), v_deposit_cents),
    'depositPaidCents', COALESCE((SELECT i.amount_paid_cents
      FROM public.invoices i
      WHERE i.id = COALESCE(v_deposit_invoice_id, v_document.deposit_invoice_id)), 0),
    'deposit_paid_cents', COALESCE((SELECT i.amount_paid_cents
      FROM public.invoices i
      WHERE i.id = COALESCE(v_deposit_invoice_id, v_document.deposit_invoice_id)), 0),
    'newlyExecuted', v_newly
  );
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('app.proposal_accept_id', COALESCE(v_previous_accept, ''), true);
  PERFORM set_config('app.commercial_document_id', COALESCE(v_previous_commercial, ''), true);
  RAISE;
END;
$$;

-- Grafted from 00758_pieces_w5_review_fixes.sql: _publish_budget_checkpoint_00661_impl.
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
    'publishedAt', v_checkpoint.published_at
  );
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('app.budget_publish_id', COALESCE(v_previous_publish, ''), true);
  RAISE;
END;
$$;
