-- ═══════════════════════════════════════════════════════════════════════════
-- 00510 — Post-00483 repairs: storage caller-binding, assignment_scope, anon ACL
--
-- Numbering: 00510 sits deliberately ABOVE the reserved bands recorded in
-- docs/engineering/migration-number-reservations.md (00494–00497 Phase 2,
-- 00498–00502 Rendered Room v2, 00503–00509 Phase 3) so this hotfix does not
-- shift any of them. The numeric gap 00494–00509 is intentional.
--
-- Four independent defects confirmed against the LIVE Strata catalog
-- (bkvcixdmuyejfzcijpdg) by read-only SELECTs on 2026-08-18, each verified to
-- match the local replay of this repo's migrations byte-for-byte (md5 of
-- pg_get_expr / prosrc) so nothing below is grafted onto a stale body.
--
-- Every object touched here is in `public` or `storage`. No svc_* schema is
-- referenced — those are Prisma-shaped on prod and cannot be reasoned about
-- from this repo's migration history (see the 00482/00493 catalog-resolving
-- pattern).
--
-- ── S1 · storage.objects "Project members can read documents" ──────────────
-- MEDIUM, live misbehavior. Lineage: 00170 → 00203 → 00430 → 00510.
--
-- The policy applies TO PUBLIC (pg_policy.polroles = '{0}' on prod AND local)
-- and its predicate calls public.is_project_team_member(uuid, uuid), on which
-- `anon` holds no EXECUTE (verified on prod: has_function_privilege('anon',
-- 'public.is_project_team_member(uuid,uuid)','EXECUTE') = false; authenticated
-- = true; the function is SECURITY DEFINER).
--
-- Postgres resolves a policy's EXECUTE permission checks at executor-init, for
-- the whole policy set that applies to the caller's role — before any bucket_id
-- short-circuit can run. So EVERY anon SELECT against storage.objects, for ANY
-- bucket, raises `permission denied for function is_project_team_member`
-- instead of returning zero rows. On prod this is the ONLY remaining PUBLIC
-- policy on storage.objects that references the helper:
--
--   polname                              | polcmd | roles
--   -------------------------------------+--------+-----------------
--   Field team can read field media      | r      | {authenticated}
--   Project members can read documents    | r      | {PUBLIC}
--
-- 00484 knowingly allowlisted this policy as "an unreviewed PUBLIC policy using
-- a protected helper" (its guard names it explicitly) and deferred the repair.
-- This is that repair.
--
-- FIX = the proven 00485 pattern: DROP + recreate TO authenticated with the
-- predicate UNCHANGED. Every leg of the predicate already requires auth.uid(),
-- so anon could only ever have evaluated to false; naming the role stops the
-- predicate from being reached at all. service_role is BYPASSRLS and is
-- unaffected. Deliberately NOT granting anon EXECUTE on the helper — that would
-- widen exposure to buy nothing.
--
-- The predicate below is 00430's source VERBATIM (only `TO authenticated` is
-- added). The verify block asserts the recreated policy's deparsed predicate
-- hashes identically to the one captured immediately before the DROP, so a
-- transcription slip fails the migration rather than silently narrowing reads.
-- Expected md5 on prod and on a clean local replay: e10021cd4fcbc1c9fdbcf143797340e6
--
-- ── S2 · public.engage_trade_scope(uuid, jsonb) ─────────────────────────────
-- HIGH, latent. Lineage: 00423 → 00475 → 00510.
--
-- 00434 added project_ffe_items.assignment_scope with DEFAULT 'unassigned' and
-- CHECK (assignment_scope IN ('room','throughout','unassigned')
--        AND ((assignment_scope = 'room') = (project_room_id IS NOT NULL))).
--
-- 00434 also shipped an auto-derivation inside
-- guard_project_ffe_selection_integrity() — 00434:472, verbatim:
--
--   NEW.assignment_scope := CASE WHEN NEW.project_room_id IS NULL
--                                THEN 'throughout' ELSE 'room' END;
--
-- 00438 re-created that guard WITHOUT the derivation block (its body now goes
-- straight from thread resolution to `IF NEW.assignment_scope = 'room' THEN`),
-- so every writer must set the column explicitly or be rejected.
--
-- engage_trade_scope's `INSERT INTO public.project_ffe_items` never names
-- assignment_scope, so it inserts the 'unassigned' default while passing
-- v_section.project_room_id. For a room-scoped trade-scope section the 00438
-- guard raises `non-room assignment cannot carry a room` (check_violation);
-- absent the guard the 00434 CHECK would reject it anyway. Engagement of any
-- trade scope with a room-scoped section is a hard failure today. This is the
-- confirmed root cause of the documented commercial/trade_scope_test.sql
-- failure (see the test-suite delta note in the report).
--
-- DERIVATION CHOICE — 'throughout', not 'unassigned', for the NULL-room case.
-- That is the value 00434's own auto-derivation chose (line 472 above): the
-- CHECK permits either, but 'unassigned' is the column DEFAULT reserved for a
-- row nobody has scoped yet, while a trade-scope presence line minted by an
-- executed, deposit-paid engagement HAS been scoped — to the project as a
-- whole. Restoring 00434's mapping keeps rows minted before 00438 and rows
-- minted after it indistinguishable, which is what the FF&E readers assume.
--
-- ── S3 · public.apply_scope_change(uuid) ────────────────────────────────────
-- HIGH, reachable. Lineage: 00084 → 00253 → 00395 → 00510.
--
-- Identical defect, identical fix. Its `INSERT INTO public.project_ffe_items`
-- omits assignment_scope while passing v_project_room_id, which is non-NULL
-- whenever the approved amendment names a room (project_room_id / projectRoomId
-- / roomName resolving to a room minted earlier in the same call). Applying any
-- approved scope change that adds a room-scoped FF&E line fails today.
--
-- S2 and S3 bodies below are the 00475 / 00395 heads VERBATIM — confirmed to be
-- the live prod bodies by md5(prosrc) equality (prod == local replay):
--   engage_trade_scope(uuid,jsonb)  b7f3a21136b39d1b1624ab1d1c62ec24  (5129 B)
--   apply_scope_change(uuid)        ba3349e6fce79e383c6bb4d5c34a9982  (6403 B)
-- The ONLY delta in each is the two added lines marked `-- 00510`.
--
-- ── S4 · anon grant asymmetry on four public tables ─────────────────────────
-- LOW-MEDIUM hardening. RLS blocks this DML today; this closes the asymmetry
-- 00483's sweep left behind.
--
-- Live prod ACLs (identical on a clean local replay — relacl compared
-- character-for-character):
--
--   organizations      anon=arwdDxtm  authenticated=rwdDxtm
--   project_ffe_items  anon=arwdDxtm  authenticated=rm
--   project_phases     anon=arwdDxtm  authenticated=rdDxtm
--   purchase_orders    anon=arwdDxtm  authenticated=rDxtm
--
-- anon — the UNAUTHENTICATED role — holds strictly MORE table privilege than
-- authenticated on all four. These are pre-flip legacy grants; 00483 narrowed
-- routines and other relations but did not reach these.
--
-- SELECT is left exactly as-is: authenticated holds SELECT on all four, so the
-- posture being mirrored is "SELECT stays". Only the write/DDL-adjacent
-- privileges are revoked from anon. No statement below names SELECT.
--
-- The S4 verify block hard-fails on the postcondition this migration owns —
-- anon holding none of the six — and only REPORTS the SELECT posture. That
-- asymmetry is deliberate: on a fresh local `supabase db reset` the ACL state
-- DURING migration replay is not prod's. Supabase's 2026-05-30 grant-default
-- flip means these tables' creation grants no longer happen, and the legacy
-- ACLs are reconstructed afterwards by supabase/seed/00-legacy-grants.sql. So
-- mid-replay `authenticated` has no SELECT on project_ffe_items even though it
-- does on prod and on the finished local stack. Asserting it here would fail
-- the reset for a condition this migration neither creates nor breaks.
--
-- This section adds REVOKEs, so supabase/seed/00-legacy-grants.sql is
-- regenerated in the same commit (python3 scripts/generate-legacy-grants.py).
-- The prod-equivalent final ACL state is asserted from the finished stack by
-- supabase/tests/rls/anon_table_grant_narrowing_test.sql.
-- ═══════════════════════════════════════════════════════════════════════════


-- ═══════════════════════════════════════════════════════════════════════════
-- S1 — bind the caller in the project-documents read policy
-- ═══════════════════════════════════════════════════════════════════════════

-- Capture the live predicate hash before dropping, so the recreate can be
-- proven byte-identical rather than merely plausible.
DO $$
DECLARE
  v_qual_md5 text;
  v_roles    text;
BEGIN
  SELECT md5(pg_get_expr(policy.polqual, policy.polrelid)), policy.polroles::text
    INTO v_qual_md5, v_roles
  FROM pg_policy AS policy
  WHERE policy.polrelid = 'storage.objects'::regclass
    AND policy.polname = 'Project members can read documents';

  IF v_qual_md5 IS NULL THEN
    RAISE EXCEPTION
      '00510 S1: policy "Project members can read documents" is absent from storage.objects — refusing to invent one';
  END IF;

  PERFORM set_config('patina.p00510_s1_qual_md5', v_qual_md5, false);
  RAISE NOTICE '00510 S1: pre-drop predicate md5=% roles=%', v_qual_md5, v_roles;
END $$;

DROP POLICY IF EXISTS "Project members can read documents" ON storage.objects;

-- Predicate VERBATIM from 00430. Only the role list changes.
-- Read: lead designer or active team member sees every file; the client sees
-- only files flagged client_visible (the 00203 narrowing).
CREATE POLICY "Project members can read documents"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'project-documents'
    AND (
      -- lead designer or active team member: every file
      EXISTS (
        SELECT 1 FROM public.projects p
        WHERE p.id = ((storage.foldername(storage.objects.name))[1])::uuid
          AND p.designer_id = auth.uid()
      )
      OR public.is_project_team_member(
           ((storage.foldername(storage.objects.name))[1])::uuid)
      -- the client: only files flagged client_visible (R24)
      OR EXISTS (
        SELECT 1
        FROM public.projects p
        JOIN public.project_documents pd
          ON pd.project_id = p.id
         AND pd.storage_path = storage.objects.name
         AND pd.client_visible = true
        WHERE p.id = ((storage.foldername(storage.objects.name))[1])::uuid
          AND p.client_id = auth.uid()
      )
    )
  );

DO $$
DECLARE
  v_before   text := current_setting('patina.p00510_s1_qual_md5', true);
  v_after    text;
  v_roles    oid[];
  v_rolnames text;
BEGIN
  SELECT md5(pg_get_expr(policy.polqual, policy.polrelid)), policy.polroles
    INTO v_after, v_roles
  FROM pg_policy AS policy
  WHERE policy.polrelid = 'storage.objects'::regclass
    AND policy.polname = 'Project members can read documents';

  IF v_after IS NULL THEN
    RAISE EXCEPTION '00510 S1: policy was not recreated';
  END IF;

  IF v_after IS DISTINCT FROM v_before THEN
    RAISE EXCEPTION
      '00510 S1: recreated predicate differs from the live one (before=%, after=%) — the read scope would change, refusing',
      v_before, v_after;
  END IF;

  IF v_roles IS DISTINCT FROM ARRAY['authenticated'::regrole::oid] THEN
    SELECT string_agg(COALESCE(role.rolname, 'PUBLIC'), ',')
      INTO v_rolnames
    FROM unnest(v_roles) AS r(oid)
    LEFT JOIN pg_roles AS role ON role.oid = r.oid;
    RAISE EXCEPTION
      '00510 S1: policy roles are {%} — expected {authenticated}', v_rolnames;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_policy AS policy
    WHERE policy.polrelid = 'storage.objects'::regclass
      AND 0 = ANY(policy.polroles)
      AND (pg_get_expr(policy.polqual, policy.polrelid) ILIKE '%is_project_team_member%'
        OR pg_get_expr(policy.polwithcheck, policy.polrelid) ILIKE '%is_project_team_member%')
  ) THEN
    RAISE EXCEPTION
      '00510 S1: a PUBLIC storage.objects policy still calls is_project_team_member — anon SELECT would still error';
  END IF;

  RAISE NOTICE
    '00510 S1 OK: predicate unchanged (md5=%), roles now {authenticated}, no PUBLIC policy left calling is_project_team_member',
    v_after;
END $$;


-- ═══════════════════════════════════════════════════════════════════════════
-- S2 — engage_trade_scope: derive assignment_scope on the presence lines
-- 00475 body VERBATIM; the two lines marked `-- 00510` are the whole delta.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.engage_trade_scope(
  p_proposal_id uuid,
  p_disclosed_impact jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_proposal public.proposals%ROWTYPE;
  v_document public.project_commercial_documents%ROWTYPE;
  v_terms public.trade_scope_terms%ROWTYPE;
  v_section record;
  v_room_label text;
  v_first boolean := true;
  v_created integer := 0;
  v_previous_progress text := current_setting('app.trade_scope_progress_id', true);
  v_anchor_phase_id uuid;   -- 00475
BEGIN
  SELECT * INTO v_proposal FROM public.proposals WHERE id = p_proposal_id FOR UPDATE;
  IF NOT FOUND OR v_proposal.document_kind <> 'trade_scope'
     OR auth.uid() IS NULL
     OR NOT public._can_author_proposal(v_proposal.designer_id)
  THEN
    RAISE EXCEPTION 'trade scope % not found or access denied', p_proposal_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO v_document FROM public.project_commercial_documents
  WHERE proposal_id = p_proposal_id FOR UPDATE;
  IF v_proposal.commercial_state IS DISTINCT FROM 'executed'
     OR v_document.executed_at IS NULL THEN
    RAISE EXCEPTION 'a trade scope must be executed before it can be engaged'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.invoices i
    WHERE i.id = v_document.deposit_invoice_id
      AND i.status = 'paid' AND i.amount_paid_cents >= i.total_cents
  ) THEN
    RAISE EXCEPTION 'the trade scope deposit invoice must be paid before engagement'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_terms FROM public.trade_scope_terms
  WHERE proposal_id = p_proposal_id FOR UPDATE;

  -- Idempotent: a scope already engaged (or further along) answers with where it
  -- is and mints nothing. Re-calling must never double the presence lines.
  IF v_terms.progress_state <> 'none' THEN
    RETURN jsonb_build_object(
      'proposalId', p_proposal_id,
      'documentId', v_document.id,
      'progressState', v_terms.progress_state,
      'engagedAt', v_terms.engaged_at,
      'presenceLineIds', COALESCE((
        SELECT jsonb_agg(i.id ORDER BY i.sort_order, i.id)
        FROM public.project_ffe_items i
        WHERE i.trade_scope_document_id = v_document.id), '[]'::jsonb),
      'newlyEngaged', false
    );
  END IF;

  PERFORM set_config('app.trade_scope_progress_id', p_proposal_id::text, true);
  UPDATE public.trade_scope_terms SET
    progress_state = 'engaged', engaged_at = now()
  WHERE proposal_id = p_proposal_id RETURNING * INTO v_terms;
  PERFORM set_config('app.trade_scope_progress_id', COALESCE(v_previous_progress, ''), true);

  FOR v_section IN
    SELECT s.*, r.name AS live_room_name
    FROM public.trade_scope_sections s
    LEFT JOIN public.project_rooms r ON r.id = s.project_room_id
    WHERE s.proposal_id = p_proposal_id
    ORDER BY s.sort_order, s.id
  LOOP
    v_room_label := NULLIF(btrim(COALESCE(v_section.room_name, v_section.live_room_name, '')), '');
    -- 00510: assignment_scope is explicit. 00438 dropped 00434's auto-derivation
    -- from guard_project_ffe_selection_integrity(), so the 'unassigned' column
    -- default paired with a non-NULL project_room_id is now a hard rejection.
    -- The mapping restores 00434:472 exactly.
    INSERT INTO public.project_ffe_items (
      project_id, project_room_id, name, ffe_category, item_type, status,
      quantity, unit_price_cents, line_total_cents,
      trade_price_cents, markup_percent, added_via, sort_order,
      trade_scope_document_id,
      assignment_scope
    ) VALUES (
      v_document.project_id, v_section.project_room_id,
      v_proposal.title || COALESCE(' — ' || v_room_label, ''),
      'trade work', 'fixed', 'approved', 1,
      -- Allocation where the studio apportioned the price; otherwise the whole
      -- price rides on the FIRST section and the rest carry zero. A trade scope
      -- is ONE price — summing the presence lines must return that price, never
      -- a multiple of it.
      COALESCE(v_section.allocation_cents,
               CASE WHEN v_first THEN v_terms.client_price_cents ELSE 0 END),
      COALESCE(v_section.allocation_cents,
               CASE WHEN v_first THEN v_terms.client_price_cents ELSE 0 END),
      NULL, NULL, 'trade-scope', v_section.sort_order,
      v_document.id,
      CASE WHEN v_section.project_room_id IS NOT NULL THEN 'room' ELSE 'throughout' END
    );
    v_first := false;
    v_created := v_created + 1;
  END LOOP;

  -- 00475 (R109 ceremony class): engagement is where the trade thread starts.
  v_anchor_phase_id := public._schedule_thread_phase(v_document.project_id);
  IF v_anchor_phase_id IS NOT NULL THEN
    PERFORM public._commit_schedule_edit_authorized(
      v_document.project_id,
      jsonb_build_array(jsonb_build_object(
        'kind', 'phase-anchor',
        'phase_id', v_anchor_phase_id,
        'anchor_date', to_char(v_terms.engaged_at::date, 'YYYY-MM-DD'),
        'source_ref', p_proposal_id
      )),
      'Trade scope engaged',
      p_disclosed_impact,
      'ceremony:trade-scope-engaged'
    );
  END IF;

  RETURN jsonb_build_object(
    'proposalId', p_proposal_id,
    'documentId', v_document.id,
    'progressState', v_terms.progress_state,
    'engagedAt', v_terms.engaged_at,
    'presenceLineCount', v_created,
    'presenceLineIds', COALESCE((
      SELECT jsonb_agg(i.id ORDER BY i.sort_order, i.id)
      FROM public.project_ffe_items i
      WHERE i.trade_scope_document_id = v_document.id), '[]'::jsonb),
    'newlyEngaged', true
  );
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('app.trade_scope_progress_id', COALESCE(v_previous_progress, ''), true);
  RAISE;
END;
$$;

REVOKE ALL ON FUNCTION public.engage_trade_scope(uuid, jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.engage_trade_scope(uuid, jsonb) TO authenticated;

COMMENT ON FUNCTION public.engage_trade_scope(uuid, jsonb) IS
  'Marks an executed, deposit-paid trade scope as engaged and mints its presence lines — one per section, filed in the section room, carrying trade_scope_document_id and no trade cost. Idempotent. 00475: engagement also anchors the trade thread, stating its schedule impact (R109/R110). 00510: presence lines carry an explicit assignment_scope (room when the section names a room, else throughout) — 00438 removed 00434''s auto-derivation, so room-scoped sections had become unengageable.';

DO $$
DECLARE
  v_src text;
BEGIN
  SELECT prosrc INTO v_src
  FROM pg_proc WHERE oid = 'public.engage_trade_scope(uuid,jsonb)'::regprocedure;

  IF v_src IS NULL THEN
    RAISE EXCEPTION '00510 S2: engage_trade_scope(uuid,jsonb) is absent';
  END IF;
  IF position('assignment_scope' IN v_src) = 0 THEN
    RAISE EXCEPTION '00510 S2: engage_trade_scope body does not set assignment_scope';
  END IF;
  IF position(
       'CASE WHEN v_section.project_room_id IS NOT NULL THEN ''room'' ELSE ''throughout'' END'
       IN v_src) = 0 THEN
    RAISE EXCEPTION '00510 S2: engage_trade_scope is missing the 00434:472 derivation';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.engage_trade_scope(uuid,jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION '00510 S2: authenticated lost EXECUTE on engage_trade_scope';
  END IF;
  IF has_function_privilege('anon', 'public.engage_trade_scope(uuid,jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION '00510 S2: anon holds EXECUTE on engage_trade_scope';
  END IF;

  RAISE NOTICE
    '00510 S2 OK: engage_trade_scope derives assignment_scope; EXECUTE = authenticated only';
END $$;


-- ═══════════════════════════════════════════════════════════════════════════
-- S3 — apply_scope_change: derive assignment_scope on amended FF&E lines
-- 00395 body VERBATIM; the two lines marked `-- 00510` are the whole delta.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.apply_scope_change(p_request_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_request public.scope_change_requests%ROWTYPE;
  v_project public.projects%ROWTYPE;
  v_project_id uuid;
  v_new_room jsonb;
  v_new_item jsonb;
  v_new_room_id uuid;
  v_room_ids_by_name jsonb := '{}'::jsonb;
  v_project_room_id uuid;
  v_quantity integer;
  v_unit_price_cents integer;
  v_line_total_cents integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'apply_scope_change requires an authenticated user'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT request.project_id INTO v_project_id
  FROM public.scope_change_requests AS request
  WHERE request.id = p_request_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Scope change request % not found or not approved', p_request_id;
  END IF;

  SELECT * INTO v_project
  FROM public.projects
  WHERE id = v_project_id
  FOR UPDATE;

  IF NOT FOUND OR NOT public._can_author_proposal(v_project.designer_id) THEN
    RAISE EXCEPTION 'Not authorized to apply scope change % for this project', p_request_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_project.status IN ('completed', 'archived') THEN
    RAISE EXCEPTION 'apply_scope_change: completed_project'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_request
  FROM public.scope_change_requests
  WHERE id = p_request_id
    AND project_id = v_project.id
    AND status = 'approved'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Scope change request % not found or not approved', p_request_id;
  END IF;

  IF v_request.applied_at IS NOT NULL THEN
    RAISE EXCEPTION 'Scope change % already applied at %', p_request_id, v_request.applied_at;
  END IF;

  IF NOT (
    (
      v_request.request_origin = 'client_request'
      AND v_request.requested_by IS NOT DISTINCT FROM v_project.client_id
    )
    OR (
      v_request.request_origin = 'designer_amendment'
      AND public._scope_change_requester_can_author(
        v_request.requested_by,
        v_project.designer_id
      )
    )
  ) THEN
    RAISE EXCEPTION 'Scope change request % has an invalid requester', p_request_id
      USING ERRCODE = 'check_violation';
  END IF;

  -- 1. Add new rooms. Canonical stored amendments use snake_case; the former
  -- browser apply path accepted camelCase. Normalize both without rewriting the
  -- immutable request evidence, and remember each generated room ID by name.
  FOR v_new_room IN
    SELECT *
    FROM jsonb_array_elements(COALESCE(v_request.new_rooms, '[]'::jsonb))
  LOOP
    INSERT INTO public.project_rooms (
      project_id,
      name,
      room_type,
      dimensions,
      floor_area_sqft,
      budget_cents,
      ffe_categories,
      notes
    ) VALUES (
      v_request.project_id,
      v_new_room->>'name',
      COALESCE(v_new_room->>'room_type', v_new_room->>'roomType'),
      v_new_room->>'dimensions',
      NULLIF(
        COALESCE(v_new_room->>'floor_area_sqft', v_new_room->>'floorAreaSqft'),
        ''
      )::numeric(10,2),
      COALESCE(
        NULLIF(
          COALESCE(v_new_room->>'budget_cents', v_new_room->>'budgetCents'),
          ''
        )::integer,
        0
      ),
      ARRAY(
        SELECT jsonb_array_elements_text(
          COALESCE(
            v_new_room->'ffe_categories',
            v_new_room->'ffeCategories',
            '[]'::jsonb
          )
        )
      ),
      v_new_room->>'notes'
    )
    RETURNING id INTO v_new_room_id;

    IF NULLIF(v_new_room->>'name', '') IS NOT NULL THEN
      v_room_ids_by_name := v_room_ids_by_name || jsonb_build_object(
        v_new_room->>'name',
        v_new_room_id::text
      );
    END IF;
  END LOOP;

  -- 2. Add new FF&E items. Besides accepting both key conventions, preserve
  -- the removed browser path's roomName → newly inserted room ID behavior.
  FOR v_new_item IN
    SELECT *
    FROM jsonb_array_elements(COALESCE(v_request.new_ffe_items, '[]'::jsonb))
  LOOP
    v_project_room_id := COALESCE(
      NULLIF(v_new_item->>'project_room_id', '')::uuid,
      NULLIF(v_new_item->>'projectRoomId', '')::uuid,
      NULLIF(
        v_room_ids_by_name->>COALESCE(
          NULLIF(v_new_item->>'roomName', ''),
          NULLIF(v_new_item->>'room_name', '')
        ),
        ''
      )::uuid
    );
    v_quantity := COALESCE(
      NULLIF(COALESCE(v_new_item->>'quantity', ''), '')::integer,
      1
    );
    v_unit_price_cents := COALESCE(
      NULLIF(
        COALESCE(v_new_item->>'unit_price_cents', v_new_item->>'unitPriceCents'),
        ''
      )::integer,
      0
    );
    v_line_total_cents := COALESCE(
      NULLIF(
        COALESCE(v_new_item->>'line_total_cents', v_new_item->>'lineTotalCents'),
        ''
      )::integer,
      v_unit_price_cents * v_quantity
    );

    -- 00510: assignment_scope is explicit, same reason and same 00434:472
    -- mapping as engage_trade_scope above.
    INSERT INTO public.project_ffe_items (
      project_id,
      project_room_id,
      name,
      ffe_category,
      item_type,
      quantity,
      unit_price_cents,
      line_total_cents,
      vendor_name,
      notes,
      assignment_scope
    ) VALUES (
      v_request.project_id,
      v_project_room_id,
      v_new_item->>'name',
      COALESCE(v_new_item->>'ffe_category', v_new_item->>'ffeCategory'),
      COALESCE(
        v_new_item->>'item_type',
        v_new_item->>'itemType',
        CASE
          WHEN v_new_item ?| ARRAY[
            'roomName', 'ffeCategory', 'itemType', 'unitPriceCents'
          ] THEN 'tbd'
          ELSE 'fixed'
        END
      ),
      v_quantity,
      v_unit_price_cents,
      v_line_total_cents,
      COALESCE(v_new_item->>'vendor_name', v_new_item->>'vendorName'),
      v_new_item->>'notes',
      CASE WHEN v_project_room_id IS NOT NULL THEN 'room' ELSE 'throughout' END
    );
  END LOOP;

  -- 3. Update project totals (body retained from 00253/00084).
  UPDATE public.projects
  SET budget_cents = budget_cents
        + COALESCE(v_request.additional_ffe_budget_cents, 0),
      design_fee_cents = design_fee_cents
        + COALESCE(v_request.additional_design_fee_cents, 0),
      target_end_date = target_end_date
        + (COALESCE(v_request.timeline_impact_weeks, 0) * 7),
      updated_at = now()
  WHERE id = v_request.project_id;

  -- 4. Mark request applied through the checked transition marker.
  PERFORM set_config(
    'app.scope_change_transition',
    format('apply:%s:%s', p_request_id, pg_catalog.txid_current()),
    true
  );
  UPDATE public.scope_change_requests
  SET applied_at = now()
  WHERE id = p_request_id;
  PERFORM set_config('app.scope_change_transition', '', true);
END;
$$;

REVOKE ALL ON FUNCTION public.apply_scope_change(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_scope_change(uuid)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.apply_scope_change(uuid) IS
  '00395 (lineage 00084→00253): atomically materializes one approved scope change. '
  'Caller must own or share the project studio; project/request locks prevent double apply. '
  '00510: amended FF&E lines carry an explicit assignment_scope (room when the amendment names a room, else throughout) — 00438 removed 00434''s auto-derivation, so room-scoped amendments could not be applied.';

DO $$
DECLARE
  v_src text;
BEGIN
  SELECT prosrc INTO v_src
  FROM pg_proc WHERE oid = 'public.apply_scope_change(uuid)'::regprocedure;

  IF v_src IS NULL THEN
    RAISE EXCEPTION '00510 S3: apply_scope_change(uuid) is absent';
  END IF;
  IF position('assignment_scope' IN v_src) = 0 THEN
    RAISE EXCEPTION '00510 S3: apply_scope_change body does not set assignment_scope';
  END IF;
  IF position(
       'CASE WHEN v_project_room_id IS NOT NULL THEN ''room'' ELSE ''throughout'' END'
       IN v_src) = 0 THEN
    RAISE EXCEPTION '00510 S3: apply_scope_change is missing the 00434:472 derivation';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.apply_scope_change(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION '00510 S3: authenticated lost EXECUTE on apply_scope_change';
  END IF;
  IF has_function_privilege('anon', 'public.apply_scope_change(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION '00510 S3: anon holds EXECUTE on apply_scope_change';
  END IF;

  RAISE NOTICE
    '00510 S3 OK: apply_scope_change derives assignment_scope; EXECUTE = authenticated + service_role';
END $$;


-- ═══════════════════════════════════════════════════════════════════════════
-- S4 — narrow anon's legacy write grants on four public tables
-- SELECT deliberately untouched (authenticated holds SELECT on all four).
-- ═══════════════════════════════════════════════════════════════════════════

REVOKE INSERT, UPDATE, DELETE, REFERENCES, TRIGGER, TRUNCATE
  ON TABLE public.project_ffe_items FROM anon;
REVOKE INSERT, UPDATE, DELETE, REFERENCES, TRIGGER, TRUNCATE
  ON TABLE public.organizations FROM anon;
REVOKE INSERT, UPDATE, DELETE, REFERENCES, TRIGGER, TRUNCATE
  ON TABLE public.project_phases FROM anon;
REVOKE INSERT, UPDATE, DELETE, REFERENCES, TRIGGER, TRUNCATE
  ON TABLE public.purchase_orders FROM anon;

DO $$
DECLARE
  v_table  text;
  v_priv   text;
  v_tables text[] := ARRAY[
    'public.project_ffe_items',
    'public.organizations',
    'public.project_phases',
    'public.purchase_orders'
  ];
  v_privs  text[] := ARRAY[
    'INSERT', 'UPDATE', 'DELETE', 'REFERENCES', 'TRIGGER', 'TRUNCATE'
  ];
BEGIN
  FOREACH v_table IN ARRAY v_tables LOOP
    FOREACH v_priv IN ARRAY v_privs LOOP
      IF has_table_privilege('anon'::name, v_table::regclass, v_priv) THEN
        RAISE EXCEPTION '00510 S4: anon still holds % on %', v_priv, v_table;
      END IF;
    END LOOP;

    -- SELECT posture is REPORTED, not asserted — see the S4 header note on
    -- mid-replay ACL state. On prod both roles read true here.
    RAISE NOTICE
      '00510 S4 OK: % — anon holds none of INSERT/UPDATE/DELETE/REFERENCES/TRIGGER/TRUNCATE; SELECT posture now anon=% authenticated=%',
      v_table,
      has_table_privilege('anon'::name, v_table::regclass, 'SELECT'),
      has_table_privilege('authenticated'::name, v_table::regclass, 'SELECT');
  END LOOP;
END $$;
